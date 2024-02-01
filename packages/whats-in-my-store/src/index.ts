import arg from './vendor/arg.cjs';
import kleur from './vendor/kleur.cjs';
import rootArgs from './util/args';
import log from './util/log';
import todo from './util/todo';
import {
  Package,
  StorePath,
  expr,
  getFlakeInputs,
  getPackages,
  isStorePath,
  nix,
  stripStorePath,
  upgradeFlakeInput,
} from './util/nix';
import { getTargetUpgrade } from './util/forge';
import help from './help';
import * as Bun from 'bun';
import path from 'node:path';
import fs from 'node:fs/promises';
import edit from './util/edit';

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
  log.info(`Getting packages...`);

  const chunks = Math.ceil(packageNames.length / CHUNK_SIZE);

  let packages: Array<Package> = [];

  packages.push(
    ...(await getPackages(
      packageNames,
      nixpkgsFlake ? 'flake' : 'channel',
      nixpkgsFlake || nixpkgsChannel,
    )),
  );

  // for (let i = 0; i < chunks; i++) {
  //   log.info(`Getting packages for chunk ${i + 1} of ${chunks}...`);

  //   packages.push(
  //     ...(await getPackages(
  //       packageNames.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
  //       nixpkgsFlake ? 'flake' : 'channel',
  //       nixpkgsFlake || nixpkgsChannel,
  //     )),
  //   );
  // }

  console.log(JSON.stringify(packages, null, 2));
};

main().catch((error) => {
  log.error('An unexpected error occurred.');
  console.error(error);
});
