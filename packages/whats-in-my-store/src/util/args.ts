import arg from '../vendor/arg.cjs';

const args = {
  '--help': Boolean,
  '-h': '--help',

  '--verbose': arg.COUNT,
  '-v': '--verbose',

  '--nixpkgs-flake': String,
  '-f': '--nixpkgs-flake',

  '--nixpkgs-channel': String,
  '-c': '--nixpkgs-channel',
};

export default args;
