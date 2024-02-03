import kleur from './vendor/kleur.cjs';

export default function help() {
  // prettier-ignore
  const message = `
${kleur.bold().blue("whats-in-my-store")}

${kleur.bold("DESCRIPTION")}

  Get the packages from NixPkgs found in your system's Nix Store.

${kleur.bold("USAGE")}

  ${kleur.dim("$")} ${kleur.bold("whats-in-my-store")} [options]

${kleur.bold("OPTIONS")}

  --nixpkgs-flake, -f       Choose the NixPkgs flake to search in
  --nixpkgs-channel, -c     Choose the NixPkgs channel to search in
  --output, -o              Output the results in a JSON file

  --help, -h                Show this help message
  --verbose                 Increase logging verbosity, up to 3 times
	`;

  console.log(message);
}
