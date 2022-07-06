//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.15;

import './CryptoCrocodiles.sol';

contract CryptoCrocodilesV2 is CryptoCrocodiles {
  function testUpgrade() public pure returns (string memory) {
    return 'version 2 works';
  }

  function version() public pure override returns (string memory) {
    return '2.0.0';
  }
}
