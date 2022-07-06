//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.15;

import '@openzeppelin/contracts-upgradeable/token/ERC721/extensions/draft-ERC721VotesUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import 'hardhat/console.sol';

interface IEgg is IERC20Upgradeable {
  function mint(address, uint256) external;
}

interface ICryptoCrocodiles is IERC721Upgradeable {
  event EggsBought(address, uint256);
  event CrocodileCreated(uint256);
  event Crocodileold();
  event Withdrawal(address indexed to, uint256 amount);

  function buyEggs() external payable;

  error NoEggs();
  error NoZeroAddress();
  error AlreadyExists();
  error WrongEtherSent();
  error NotEnoughFundsForEgg();
  error NeedToWait10Minutes();
  error Unauthorized();
  error InsufficientFunds();
  error FailedCall();
}

contract CryptoCrocodiles is Initializable, ERC721VotesUpgradeable, ReentrancyGuardUpgradeable, ICryptoCrocodiles, OwnableUpgradeable, UUPSUpgradeable {
  mapping(uint256 => address) public crocodileToOwner;
  IEgg public eggs;
  uint256 public eggPrice;
  uint256 public crocodilesCreated;
  mapping(uint256 => uint256) public crocodileEggLaying;

  function initialize(address _eggs) public initializer {
    __ERC721_init('Crypto Crocodiles', 'CROC');
    __ReentrancyGuard_init();
    __Ownable_init();
    eggPrice = 0.01 ether;
    eggs = IEgg(_eggs);
  }

  function buyEggs() external payable override nonReentrant {
    uint256 eggsCallerCanBuy = (msg.value / eggPrice);
    if (eggsCallerCanBuy < 1) revert NotEnoughFundsForEgg();
    eggs.mint(msg.sender, eggsCallerCanBuy);
    emit EggsBought(msg.sender, eggsCallerCanBuy);
  }

  function create() external nonReentrant {
    if (eggs.balanceOf(msg.sender) < 1) revert NoEggs();
    uint256 _crocodileId = ++crocodilesCreated;
    crocodileToOwner[_crocodileId] = msg.sender;
    _mint(msg.sender, _crocodileId);
    emit CrocodileCreated(_crocodileId);
  }

  function sell(uint256 _crocodileId) external nonReentrant {
    if (crocodileToOwner[_crocodileId] != msg.sender) revert Unauthorized();
    if (address(this).balance < 0.004 ether) revert InsufficientFunds();
    delete crocodileToOwner[_crocodileId];
    _burn(_crocodileId);
    (bool success, ) = msg.sender.call{value: 0.004 ether}('');
    if (success == false) revert FailedCall();
  }

  function getContractBalance() public view returns (uint256) {
    return address(this).balance;
  }

  function getCrocodilesCreated() public view returns (uint256) {
    return crocodilesCreated;
  }

  function layEgg(uint256 _crocodileId) external nonReentrant {
    if (crocodileToOwner[_crocodileId] != msg.sender) revert Unauthorized();
    if (block.timestamp - crocodileEggLaying[_crocodileId] <= 10 minutes) revert NeedToWait10Minutes();
    crocodileEggLaying[_crocodileId] = block.timestamp;
    eggs.mint(msg.sender, _getPseudoRandomNumber());
  }

  function withdraw(address _address) external nonReentrant onlyOwner returns (bool success) {
    uint256 availableAmount = address(this).balance - (_getTotalSupply() * 0.004 ether);
    (success, ) = _address.call{value: availableAmount}('');
    if (success) emit Withdrawal(_address, availableAmount);
  }

  function version() public pure virtual returns (string memory) {
    return '1.0.0';
  }

  function changePrice(uint256 _eggPrice) public onlyOwner {
    eggPrice = _eggPrice;
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function _getPseudoRandomNumber() private view returns (uint256 randomKeccak) {
    randomKeccak = uint256(keccak256(abi.encodePacked(block.difficulty, block.timestamp, msg.sender))) % 10;
  }
}
