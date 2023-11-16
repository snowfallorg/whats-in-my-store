import arg from './vendor/arg.cjs';
import kleur from './vendor/kleur.cjs';
import rootArgs from './util/args';
import log from './util/log';
import todo from './util/todo';
import {
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

  const packages = await getPackages(
    packageNames,
    nixpkgsFlake ? 'flake' : 'channel',
    nixpkgsFlake || nixpkgsChannel,
  );

  console.log(packages.slice(0, 10));
};

main().catch((error) => {
  log.error('An unexpected error occurred.');
  console.error(error);
});
