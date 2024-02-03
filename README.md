# What's In My Store?

<a href="https://nixos.wiki/wiki/Flakes" target="_blank">
	<img alt="Nix Flakes Ready" src="https://img.shields.io/static/v1?logo=nixos&logoColor=d8dee9&label=Nix%20Flakes&labelColor=5e81ac&message=Ready&color=d8dee9&style=for-the-badge">
</a>
<a href="https://github.com/snowfallorg/lib" target="_blank">
	<img alt="Built With Snowfall" src="https://img.shields.io/static/v1?label=Built%20With&labelColor=5e81ac&message=Snowfall&color=d8dee9&style=for-the-badge">
</a>

<p>
<!--
	This paragraph is not empty, it contains an em space (UTF-8 8195) on the next line in order
	to create a gap in the page.
-->
  
</p>

> Get the packages from NixPkgs found in your system's Nix Store.

## Installation

### Nix Profile

You can install this package imperatively with the following command.

```bash
nix profile install github:snowfallorg/whats-in-my-store
```

### Nix Configuration

You can install this package by adding it as an input to your Nix Flake.

```nix
{
	description = "My system flake";

	inputs = {
		nixpkgs.url = "github:nixos/nixpkgs/nixos-23.05";

		# Snowfall Lib is not required, but will make configuration easier for you.
		snowfall-lib = {
			url = "github:snowfallorg/lib";
			inputs.nixpkgs.follows = "nixpkgs";
		};

		whats-in-my-store = {
			url = "github:snowfallorg/whats-in-my-store";
			inputs.nixpkgs.follows = "nixpkgs";
		};
	};

	outputs = inputs:
		inputs.snowfall-lib.mkFlake {
			inherit inputs;
			src = ./.;

			overlays = with inputs; [
				# Use the overlay provided by this flake.
				whats-in-my-store.overlays.default

				# There is also a named overlay, though the output is the same.
				whats-in-my-store.overlays."package/whats-in-my-store"
			];
		};
}
```

If you've added the overlay from this flake, then in your system configuration you
can add the `snowfallorg.whats-in-my-store` package.

```nix
{ pkgs }:

{
	environment.systemPackages = with pkgs; [
		snowfallorg.whats-in-my-store
	];
}
```

## Usage

```
whats-in-my-store

DESCRIPTION

  Get the packages from NixPkgs found in your system's Nix Store.

USAGE

  $ whats-in-my-store [options]

OPTIONS

  --nixpkgs-flake, -f       Choose the NixPkgs flake to search in
  --nixpkgs-channel, -c     Choose the NixPkgs channel to search in
  --output, -o              Output the results in a JSON file

  --help, -h                Show this help message
  --verbose                 Increase logging verbosity, up to 3 times
```
