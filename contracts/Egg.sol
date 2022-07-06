import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IEgg is IERC20 {
  function mint(address, uint256) external;
  error OnlyCrocodilesCanMint();
}

//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.15;

contract Egg is ERC20, IEgg {
  address public crocodiles;

  constructor(address _crocodiles) ERC20('EGG', 'EGG') {
    crocodiles = _crocodiles;
  }

  function mint(address _to, uint256 _amount) external override {
    if (msg.sender != crocodiles) revert OnlyCrocodilesCanMint();
    _mint(_to, _amount);
  }

  function decimals() public view virtual override returns (uint8) {
    return 0;
  }
}
