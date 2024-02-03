import fs from 'node:fs/promises';
import path from 'node:path';
import help from './help';
import rootArgs from './util/args';
import log from './util/log';
import {
  Package,
  StorePath,
  getPackages,
  isStorePath,
  removePackageHashPrefix,
  stripStorePath,
} from './util/nix';
import arg from './vendor/arg.cjs';
import kleur from './vendor/kleur.cjs';

const CHUNK_SIZE = 100;

const main = async () => {
  const args = arg(rootArgs, {
    permissive: true,
  });

  log.debug({ args });

  if (args['--help']) {
    help();
    process.exit(0);
  }

  if (args['--nixpkgs-flake'] && args['--nixpkgs-channel']) {
    log.error(
      'You can only specify one of --nixpkgs-flake or --nixpkgs-channel.',
    );
    process.exit(1);
  }

  let nixpkgsFlake = args['--nixpkgs-flake'];
  const nixpkgsChannel = args['--nixpkgs-channel'];

  if (!nixpkgsFlake && !nixpkgsChannel) {
    nixpkgsFlake = 'flake:nixpkgs';
  }

  log.debug({ flakes: nixpkgsFlake, channel: nixpkgsChannel });

  const packagePaths = await fs.readdir(path.resolve('/nix/store'));

  const storePaths: StorePath[] = packagePaths.filter(
    (packagePath: string) =>
      isStorePath(`/nix/store/${packagePath}`) && !packagePath.endsWith('.drv'),
  );

  log.info(`Found ${storePaths.length} paths in the Nix Store`);
  log.info(`Getting packages... This can take a while...`);

  const packages: Array<Package> = await getPackages(
    nixpkgsFlake ? 'flake' : 'channel',
    nixpkgsFlake || nixpkgsChannel,
  );

  const matches: Array<Package> = [];

  for (const pkg of packages) {
    let found = false;

    for (const [name, file] of Object.entries(pkg.outputs ?? {})) {
      // @ts-expect-error
      if (storePaths.includes(stripStorePath(file))) {
        found = true;
        log.info(
          `Exact match for ${kleur.green(
            pkg.attr,
          )}.${name} found at ${kleur.bold(file)}.`,
        );
        break;
      }
    }

    if (!found) {
      const name = pkg.version ? `${pkg.name}-${pkg.version}` : pkg.name;

      for (const storePath of storePaths) {
        if (removePackageHashPrefix(storePath) === `${name}`) {
          found = true;
          log.info(
            `Name match for ${kleur.yellow(
              pkg.attr,
            )} found at /nix/store/${kleur.bold(storePath)}.`,
          );
          break;
        }
      }
    }

    if (found) {
      matches.push(pkg);
    }
  }

  if (args['--output']) {
    const file = path.isAbsolute(args['--output'])
      ? args['--output']
      : path.resolve(args['--output']);

    log.info(`Writing matches to ${kleur.bold(file)}...`);

    await fs.writeFile(file, JSON.stringify(matches));
  }
};

main().catch((error) => {
  log.error('An unexpected error occurred.');
  console.error(error);
});
