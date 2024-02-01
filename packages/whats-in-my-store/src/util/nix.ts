import * as Bun from 'bun';
import { readFile } from 'bun';
import todo from './todo';
import merge from './merge';
import edit from './edit';

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
  description: string;
  longDescription: string;
  outputs: {
    [name: string]: string;
  };
};

export const getPackages = async (
  names: string[],
  source: 'flake' | 'channel',
  nixpkgs: string,
) => {
  const packages: Array<Package> = [];

  const getNixpkgs =
    source === 'flake'
      ? `let f = (prelude.get-flake "${nixpkgs}"); in f.legacyPackages.\${builtins.currentSystem} or f.pkgs.\${builtins.currentSystem}.nixpkgs or f.packages.\${builtins.currentSystem}`
      : `(import <${nixpkgs}> {})`;

  try {
    const result = await expr(
      nix`
let
	pkgs = ${getNixpkgs};
	cached-package-names = [ ${names.map((name) => `"${name}"`).join(' ')} ];
	failing-packages = [];

	is-cached-package = package: builtins.elem package.name cached-package-names;

	get-package-meta = attr: pkg: {
		inherit attr;
		name = pkg.name or null;
		description = pkg.meta.description or null;
		longDescription = pkg.meta.longDescription or null;
		outputs = pkgs.lib.foldl (acc: output:  acc // {
			"\${output}" = pkg.\${output};
		}) {} (pkg.outputs or []);
	};

	evaluate-package = pkg:
		let
			result = builtins.tryEval (
				pkgs.lib.isDerivation pkg && !(pkgs.lib.attrByPath [ "meta" "broken" ] false pkg) && builtins.seq pkg.name true && pkg ? outputs
			);
		in
			result.success && result.value;

	evaluate-namespace = namespace-name: namespace:
		let
			packages = pkgs.lib.filterAttrs (_: evaluate-package) namespace;
		in
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
					name = package-name;
					description = package.meta.description or null;
					longDescription = package.meta.longDescription or null;
					inherit outputs;
				})
		) packages;

	evaluating-packages = evaluate-namespace "" pkgs;
	cached-packages = pkgs.lib.filterAttrs (name: is-cached-package) evaluating-packages;
	packages-data = pkgs.lib.mapAttrs get-package-meta cached-packages;
in
	#packages-data
	#resolved-namespaces
	evaluate-namespace "python311Packages" pkgs.python311Packages
		`,
    );

    console.log(JSON.parse(result));
    process.exit(1);

    for (const pkg of JSON.parse(result)) {
      packages.push(pkg as Package);
    }
  } catch (error) {
    console.error(error);
  }

  return packages;
};
