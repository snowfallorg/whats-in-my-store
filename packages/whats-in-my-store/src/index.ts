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

  const packagePaths = await fs.readdir(path.resolve('/nix/store'));
  const storePaths: StorePath[] = packagePaths.filter(
    (packagePath: string) =>
      isStorePath(`/nix/store/${packagePath}`) && !packagePath.endsWith('.drv'),
  );
  let packageNames = storePaths.map((storePath) =>
    stripStorePath(`/nix/store/${storePath}` as StorePath),
  );

  log.info(`Found ${packageNames.length} paths in the Nix Store`);
  log.info(`Getting packages... This can take a while...`);

  const chunks = Math.ceil(packageNames.length / CHUNK_SIZE);

  const packages: Array<Package> = await getPackages(
    packageNames,
    nixpkgsFlake ? 'flake' : 'channel',
    nixpkgsFlake || nixpkgsChannel,
  );

  for (const pkg of packages) {
    let found = false;

    for (const [name, file] of Object.entries(pkg.outputs ?? {})) {
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
  }
};

main().catch((error) => {
  log.error('An unexpected error occurred.');
  console.error(error);
});
