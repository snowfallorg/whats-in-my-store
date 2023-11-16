{
  description = "Get the packages from NixPkgs found in your system's Nix Store";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-23.05";
    unstable.url = "github:nixos/nixpkgs/nixos-unstable";

    snowfall-lib = {
      url = "github:snowfallorg/lib?ref=v2.1.1";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs:
    inputs.snowfall-lib.mkFlake {
      inherit inputs;

      src = ./.;

      snowfall = {
        namespace = "snowfallorg";

        meta = {
          name = "whats-in-my-store";
          title = "What's In My Store?";
        };
      };
      alias.packages.default = "whats-in-my-store";
    };
}
