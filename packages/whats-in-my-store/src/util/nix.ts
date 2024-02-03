import * as Bun from 'bun';
import arg from '../vendor/arg.cjs';
import todo from './todo';
import merge from './merge';
import edit from './edit';
import rootArgs from './args';

const args = arg(rootArgs, { permissive: true });

export const exec = async (command: string[], options: object = {}) => {
  const proc = Bun.spawn(command, options);

  return await new Response(proc.stdout).text();
};

export const nix = (strings: TemplateStringsArray, ...values: any[]) => {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += values[i];
    }
  }

  return result;
};

export type StorePath = string & { __type: 'StorePath' };

const STORE_PATH_REGEX = /^\/nix\/store\/[a-zA-Z0-9]{32}-(?<name>.+)$/;

export const isStorePath = (path: string): path is StorePath => {
  return STORE_PATH_REGEX.test(path);
};

export const stripStorePath = (path: StorePath) => {
  const match = path.match(STORE_PATH_REGEX);

  if (!match || !match.groups) {
    throw new Error('Invalid store path: ' + path);
  }

  return match.groups.name;
};

export const removePackageHashPrefix = (name: string) => {
  return name.replace(/^[a-zA-Z0-9]{32}-/, '');
};

export const splitPackageNameVersion = (name: string) => {
  const match = name.match(/^(?<name>.+?)-(?<version>[^\-]+)$/);

  if (!match || !match.groups) {
    return { name, version: null };
  }

  return match.groups as {
    name: string;
    groups: string;
  };
};

const escapeNixExpression = (code) => code.replaceAll(/'/g, "'\\''");

const prelude = nix`
	let
		prelude = {
			system = builtins.currentSystem;

			tf = x: if x then "true" else "false";

			flatten = value:
				if builtins.isList value then
					builtins.concatMap prelude.flatten value
				else
					[value];

			has-prefix = prefix: text:
				(builtins.substring 0 (builtins.stringLength prefix) text) == prefix;

			map-attrs-to-list = f: attrs:
				builtins.map (name: f name attrs.\${name}) (builtins.attrNames attrs);

			name-value-pair = name: value: { inherit name value; };

			filter-attrs = predicate: attrs:
				builtins.listToAttrs
					(builtins.concatMap
						(name:
							if predicate name attrs.\${name} then
								[(prelude.name-value-pair name attrs.\${name})]
							else
								[]
						)
						(builtins.attrNames attrs)
					);

			get-flake = path:
				let
					is-path = (prelude.has-prefix "/" path) || (prelude.has-prefix "." path);
					flake-uri = if is-path then "path:\${builtins.toString path}" else path;
				in
					builtins.getFlake flake-uri;
		};
	in
`;

export const expr = async (
  code,
  options: {
    json?: boolean;
    impure?: boolean;
    execOptions?: any;
  } = {},
) => {
  const { json = true, impure = true, execOptions = {} } = options;

  const expression = [prelude, code].map(escapeNixExpression).join('\n');

  const command = [
    `nix`,
    `eval`,
    `--show-trace`,
    ...(json ? ['--json'] : []),
    ...(impure ? ['--impure'] : []),
    '--expr',
    expression,
  ];

  const output = await exec(command, {
    ...execOptions,
    env: {
      ...execOptions.env,
      // NIXPKGS_ALLOW_UNSUPPORTED_SYSTEM: '1',
      NIXPKGS_ALLOW_BROKEN: '1',
      NIXPKGS_ALLOW_UNFREE: '1',
      NIXPKGS_ALLOW_INSECURE: '1',
    },
  });

  return output;
};

export type Package = {
  attr: string;
  name: string;
  version: string | null;
  description: string | null;
  longDescription: string | null;
  outputs: {
    [name: string]: string;
  };
};

export const getPackages = async (
  source: 'flake' | 'channel',
  nixpkgs: string,
) => {
  let packages: Array<Package> = [];

  const getNixpkgs =
    source === 'flake'
      ? `let f = (prelude.get-flake "${nixpkgs}"); in f.legacyPackages.\${builtins.currentSystem} or f.pkgs.\${builtins.currentSystem}.nixpkgs or f.packages.\${builtins.currentSystem}`
      : `(import <${nixpkgs}> {})`;

  try {
    const result = await expr(
      nix`
let
	pkgs = ${getNixpkgs};

	is-valid-package = name: pkg:
		let
			result = builtins.tryEval (
				pkgs.lib.isDerivation pkg
				&& !(pkgs.lib.attrByPath [ "meta" "broken" ] false pkg)
				&& builtins.seq pkg.name true
				&& pkg ? outputs
				&& builtins.seq "\${pkg}" true
			);
		in
			# tkinter fails to evaluate with an "unexpected argument 'x11Support'" error.
			(!(pkgs.lib.hasSuffix ".tkinter" name))
			# Other architectures like "pkgsx86_64Darwin" and target packages are not necessary.
			&& (!(pkgs.lib.hasPrefix "pkgs" name))
			&& (!(pkgs.lib.hasInfix "Cross." name))
			# nixosTests aren't necessary.
			&& (!(pkgs.lib.hasPrefix "nixosTests." name))
			# nodePackages fails to evaluate with an "unexpected argument 'meta'" error.
			&& (!(pkgs.lib.hasPrefix "nodePackages" name))
			# netbsd.libcurses fails with a type error.
			&& (!(pkgs.lib.hasPrefix "netbsd.libcurses" name))
			# netbsd.libedit fails with a type error.
			&& (!(pkgs.lib.hasPrefix "netbsd.libedit" name))
			# gnomeExtensions.audio-output-switcher no longer exists.
			&& (!(pkgs.lib.hasPrefix "gnomeExtensions.audio-output-switcher" name))
			# dockapps.wmsm-app fails due to an undefined variable 'src'.
			&& (!(pkgs.lib.hasPrefix "dockapps.wmsm-app" name))
			# dockapps.wmsystemtray fails due to an undefined variable 'platforms'.
			&& (!(pkgs.lib.hasPrefix "dockapps.wmsystemtray" name))
			# darwin.opencflite fails due to a type error.
			&& (!(pkgs.lib.hasPrefix "darwin.opencflite" name))
			&&
				${
          args['--verbose'] === 3
            ? `(builtins.trace "evaluating attribute: \${name}")`
            : ''
        }
				result.success && result.value;

	evaluate-namespace = namespace-name: namespace:
		let
			packages = pkgs.lib.filterAttrs (name: value: is-valid-package (if namespace-name == "" then "\${name}" else "\${namespace-name}.\${name}") value) namespace;
			packages-data =
				builtins.mapAttrs (package-name: package:
					let
						all-outputs = builtins.tryEval package.outputs;
						outputs = pkgs.lib.foldl (acc: output:
							let
								# WARN: This code is extremely delicate. The toString MUST be placed inside the
								# tryEval and only result.value may be referenced. Otherwise the package will re-eval and
								# possibly fail.
								result = builtins.tryEval (builtins.toString package.\${output});
							in
								acc // 
								(if result.success then { "\${output}" = result.value; } else {})
						) {} (if all-outputs.success then all-outputs.value else []);
					in
						({
							attr = if namespace-name == "" then package-name else "\${namespace-name}.\${package-name}";
							name = package-name;
							version = package.version or null;
							description = package.meta.description or null;
							longDescription = package.meta.longDescription or null;
							inherit outputs;
						})
				) packages;
		in
		${
      args['--verbose'] === 3
        ? `(builtins.trace "evaluating namespace: \${if namespace-name == "" then "<root>" else namespace-name}")`
        : ''
    }
		packages-data;

	root-packages = evaluate-namespace "" pkgs;

	maybe-namespaces = pkgs.lib.filterAttrs (name: value:
		let
			result = builtins.tryEval (pkgs.lib.isAttrs value && !(pkgs.lib.isDerivation value) && !(pkgs.lib.isFunction value));
		in
			result.success && result.value
	) pkgs;

	maybe-namespaces-with-packages = pkgs.lib.mapAttrs (namespace-name: namespace:
		let
			packages = (pkgs.lib.filterAttrs (name: value: is-valid-package "\${namespace-name}.\${name}" value) namespace);
		in
			pkgs.lib.optionalAttrs (
				# cudaPackages fails to evaluate using "abort" which cannot be caught with tryEval.
				!(pkgs.lib.hasPrefix "cudaPackages" namespace-name)
				# vmTools fails when attempting to eval "vmTools.initrd" due to a type/syntax error.
				&& namespace-name != "vmTools"
				&& namespace-name != "targetPackages"
				# We don't want or need the following NixPkgs internal namespaces.
				&& namespace-name != "lib"
				&& namespace-name != "__splicedPackages"
				&& namespace-name != "pkgsBuildBuild"
				&& namespace-name != "pkgsBuildHost"
				&& namespace-name != "pkgsBuildTarget"
				&& namespace-name != "pkgsHostHost"
				&& namespace-name != "pkgsHostTarget"
				&& namespace-name != "pkgsTargetTarget"
				&& namespace-name != "buildPackages"
				&& namespace-name != "targetPackages"
				&& namespace-name != "pkgsLLVM"
				&& namespace-name != "pkgsMusl"
				&& namespace-name != "pkgsStatic"
				&& namespace-name != "pkgsCross"
			) packages
	) maybe-namespaces;

	evaluating-namespaces = pkgs.lib.foldl (acc: namespace:
		if builtins.attrNames (maybe-namespaces-with-packages."\${namespace}") == [] then
			acc
		else
			acc // {
				"\${namespace}" = evaluate-namespace namespace (maybe-namespaces-with-packages."\${namespace}");
			}
	) {} (builtins.attrNames maybe-namespaces-with-packages);

	all-packages = builtins.attrValues root-packages ++ (
		prelude.flatten (prelude.map-attrs-to-list (_: namespace:
			prelude.map-attrs-to-list (_: package: package) namespace
		) evaluating-namespaces)
	);
in
	all-packages
		`,
      {
        execOptions: {
          stdio:
            args['--verbose'] === 3
              ? ['ignore', 'inherit', 'inherit']
              : ['ignore', 'pipe', 'pipe'],
        },
      },
    );

    const data = JSON.parse(result);

    if (Array.isArray(data)) {
      packages = data;
    } else {
      console.error(data);
      throw new Error('Invalid result, expected an array');
    }
  } catch (error) {
    console.error(error);
  }

  return packages;
};
