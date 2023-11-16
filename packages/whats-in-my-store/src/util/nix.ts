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
    execOptions?: object;
  } = {},
) => {
  const { json = true, impure = true, ...execOptions } = options;

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
  });

  return output;
};

export const getPackages = async (
  names: string[],
  source: 'flake' | 'channel',
  nixpkgs: string,
) => {
  const packages = [];

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
	evaluating-packages = pkgs.lib.filterAttrs (name: value:
		(builtins.tryEval value).success && pkgs.lib.isDerivation value && !(builtins.elem value.name failing-packages)
  ) pkgs;
	cached-packages = pkgs.lib.filterAttrs (name: value:
		builtins.elem value.name cached-package-names
  ) evaluating-packages;
	get-package-meta = attr: pkg: {
		inherit attr;
		name = pkg.name or null;
		description = pkg.meta.description or null;
		longDescription = pkg.meta.longDescription or null;
	};
in
	pkgs.lib.mapAttrs get-package-meta cached-packages
		`,
    );

    console.log(JSON.parse(result));
  } catch (error) {
    console.error(error);
  }

  return packages;
};
