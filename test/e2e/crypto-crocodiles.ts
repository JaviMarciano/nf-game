import { expect } from 'chai';
import { ethers } from 'hardhat';
import { utils, BigNumber, ContractFactory, Signer } from 'ethers';
import { CryptoCrocodiles, Egg, Egg__factory } from '@typechained';
import { evm } from '@utils';
import { upgrades } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('CryptoCrocodiles', function () {
  // signers
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  // factories
  let cryptoCrocodilesFactory: ContractFactory;
  let eggFactory: Egg__factory;

  // contracts
  let cryptoCrocodiles: CryptoCrocodiles;
  let egg: Egg;

  // misc
  let eggPrecalculatedAddress: string;
  let snapshotId: string;
  let eggPrice: BigNumber;
  let twoEggsPrice: BigNumber;
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  before(async () => {
    // forking mainnet
    await evm.reset({
      jsonRpcUrl: process.env.RPC_ROPSTEN
    });

    // getting signers with ETH
    [, deployer, user1, user2, user3] = await ethers.getSigners();

    // precalculating egg's contract address as both cryptoCrocodiles' contract and Eggs' contract depend on
    // one another
    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    eggPrecalculatedAddress = utils.getContractAddress({ from: deployer.address, nonce: currentNonce });

    // deploying contracts
    cryptoCrocodilesFactory = await ethers.getContractFactory('CryptoCrocodiles');
    cryptoCrocodiles = (await upgrades.deployProxy(cryptoCrocodilesFactory, [eggPrecalculatedAddress], { initializer: 'initialize', kind: 'uups' })) as CryptoCrocodiles;
    eggFactory = (await ethers.getContractFactory('Egg')) as Egg__factory;
    egg = await eggFactory.connect(deployer).deploy(cryptoCrocodiles.address);

    eggPrice = ethers.utils.parseEther('0.01');
    twoEggsPrice = ethers.utils.parseEther('0.02');
    // snapshot
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('initialization', () => {
    //initialize is a function that should be invoked only once when hardhat upgrade deploys the contract
    it('should fail when initialize is invoked', async () => {
      await expect(cryptoCrocodiles.initialize(eggPrecalculatedAddress)).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('name should be Crypto Crocodile', async () => {
      const name = await cryptoCrocodiles.name();
      expect(name).to.be.equal('Crypto Crocodiles');
    });

    it('symbol should be CROC', async () => {
      const symbol = await cryptoCrocodiles.symbol();
      expect(symbol).to.be.equal('CROC');
    });

    it('eggPrice should be 0.01 ether', async () => {
      const initializedEggPrice = await cryptoCrocodiles.eggPrice();
      expect(initializedEggPrice).to.be.equal(eggPrice);
    });

    it('owner should be initialized', async () => {
      const owner = await cryptoCrocodiles.owner();
      expect(owner).to.be.not.equal(ZERO_ADDRESS);
    });

    it('eggs contract should be initialized', async () => {
      const eggs = await cryptoCrocodiles.eggs();
      expect(eggs).to.be.not.equal(ZERO_ADDRESS);
    });
  });

  describe('upgrade', () => {
    it('should be able to invoke a function of the v2 contract after the upgrade', async () => {
      const cryptoCrocodilesV2Factory = await await ethers.getContractFactory('CryptoCrocodilesV2');
      const cryptoCrocodilesV2 = await upgrades.upgradeProxy(cryptoCrocodiles, cryptoCrocodilesV2Factory);
      const result = await cryptoCrocodilesV2.testUpgrade();
      expect(result).to.be.equal('version 2 works');
    });

    it('should return version 2.0.0 after the upgrade', async () => {
      const initialOne = '1.0.0',
        versionTwo = '2.0.0';
      const versionPreviousToUpgrade = await cryptoCrocodiles.version();
      expect(versionPreviousToUpgrade).to.be.equal(initialOne);

      //upgrade
      const cryptoCrocodilesV2Factory = await await ethers.getContractFactory('CryptoCrocodilesV2');
      await upgrades.upgradeProxy(cryptoCrocodiles, cryptoCrocodilesV2Factory);
      const versionPostUpgrade = await cryptoCrocodiles.version();

      expect(versionPostUpgrade).to.be.equal(versionTwo);
    });


  });

  describe('buy eggs', () => {
    it('balance should be 1 when the value sent is equal to the egg price', async () => {
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      const eggBalance = await egg.balanceOf(user1.address);
      expect(eggBalance).to.equal(1);
    });

    it('balance should be 2 when the value sent is double of the egg price', async () => {
      await cryptoCrocodiles.connect(user1).buyEggs({ value: twoEggsPrice });
      const eggBalance = await egg.balanceOf(user1.address);
      expect(eggBalance).to.equal(2);
    });

    it('balance should be 3 when the user buy thrice', async () => {
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      const eggBalance = await egg.balanceOf(user1.address);
      expect(eggBalance).to.equal(3);
    });

    it('should fail if value sent is not enough to buy an egg', async () => {
      await expect(cryptoCrocodiles.connect(user1).buyEggs()).to.be.revertedWith('NotEnoughFundsForEgg()');
    });

    it('should emit EggsBought when egg is bought', async () => {
      await expect(cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice })).to.emit(cryptoCrocodiles, 'EggsBought');
    });
  });

  describe('create Crocodiles', async () => {
    it('should buy an egg and create a new crocodile with it', async () => {
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).create();
      const balance = await cryptoCrocodiles.balanceOf(user1.address);
      expect(balance).to.equal(1);
    });

    it('should increment by one crocodilesCreated after an crocodile is created', async () => {
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).create();
      const crocodilesCreated = await cryptoCrocodiles.crocodilesCreated();
      expect(crocodilesCreated).to.equal(1);
    });

    it('Should emit CrocodileCreated when an crocodile is created', async function () {
      const tx = await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await expect(cryptoCrocodiles.connect(user1).create()).to.emit(cryptoCrocodiles, 'CrocodileCreated').withArgs(1);
    });

    it('Should revert when a user with 0 eggs try to create a crocodile', async function () {
      await expect(cryptoCrocodiles.connect(user1).create()).to.be.revertedWith('NoEggs()');
    });
  });

  describe('sell Crocodiles', async () => {
    it('should send funds to the user who sells a crocodile', async () => {
      /*
      the user balance is affected by the transaction cost and the refund of the sell 
      newUserBalance = balancePreviousToSell - transactionCost + refund
      so...
      refund = newUserBalance - balancePreviousToSell + transactionCost        
      */

      const crocodileIdCreated = 1;
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).create();
      const balancePreviousToSell = await ethers.provider.getBalance(user1.address);

      //sell
      const tx = await cryptoCrocodiles.connect(user1).sell(crocodileIdCreated);

      //calculate the transaction cost
      const receipt = await tx.wait();
      const transactionCost = tx.gasPrice?.mul(receipt.gasUsed) as BigNumber;

      const newUserBalance = await ethers.provider.getBalance(user1.address);

      //refund = newUserBalance - balancePreviousToSell + transactionCost
      const refund = ethers.utils.formatEther(newUserBalance.sub(balancePreviousToSell).add(transactionCost));

      expect(refund).to.be.equal('0.004');
    });

    it('should burn the crocodile after the user sells it', async () => {
      const crocodileIdCreated = 1;
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).create();

      await expect(cryptoCrocodiles.connect(user1).sell(crocodileIdCreated))
        .to.emit(cryptoCrocodiles, 'Transfer')
        .withArgs(user1.address, ZERO_ADDRESS, crocodileIdCreated);

      const crocodileBalance = await cryptoCrocodiles.balanceOf(user1.address);
      expect(crocodileBalance).to.equal(0);

      await expect(cryptoCrocodiles.ownerOf(crocodileIdCreated)).to.be.revertedWith('ERC721: owner query for nonexistent token');

      const createdCrocodiles = await cryptoCrocodiles.crocodilesCreated();
      expect(createdCrocodiles).to.equal(1);
    });

    it('should fail if user who try to sell is not the owner', async () => {
      const crocodileIdCreated = 1;
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).create();

      await expect(cryptoCrocodiles.connect(user2).sell(crocodileIdCreated)).to.be.revertedWith('Unauthorized()');

      const user1crocodileBalance = await cryptoCrocodiles.balanceOf(user1.address);
      expect(user1crocodileBalance).to.equal(1);
    });
  });

  describe('lay eggs', async () => {
    it('should fail if user who try to lay eggs is not the owner', async () => {
      const crocodileIdCreated = 1;
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).create();

      await expect(cryptoCrocodiles.connect(user2).layEgg(crocodileIdCreated)).to.be.revertedWith('Unauthorized()');

      const eggBalance = await egg.balanceOf(user1.address);
      expect(eggBalance).to.equal(1);
    });

    it('should fail if user try to lay a new egg before 10 minutes after the first laying', async () => {
      const crocodileIdCreated = 1;
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).create();
      //lay first egg
      await cryptoCrocodiles.connect(user1).layEgg(crocodileIdCreated);
      //try to lay a second egg before 10 minutes after the first one
      await expect(cryptoCrocodiles.connect(user1).layEgg(crocodileIdCreated)).to.be.revertedWith('NeedToWait10Minutes()');
      /*
      the user bought 1 egg, created 1 crocodile that should hace burned the egg
      the first laying should have created n new eggs with this crocodile (between 0 and 10)
      the second try should have failed
      so the new balance should be n then newBalance should be a value between 0 and 10
      */
      const eggBalance = await egg.balanceOf(user1.address);
      expect(eggBalance.gte(0)).to.be.true;
      expect(eggBalance.lte(10)).to.be.true;
    });


    it('should lay a new egg after 10 minutes of the first laying', async () => {
      const crocodileIdCreated = 1;
      const tenMinutes = 600;
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      await cryptoCrocodiles.connect(user1).create();
      //lay first egg
      await cryptoCrocodiles.connect(user1).layEgg(crocodileIdCreated);
      //try to lay a second egg before 10 minutes after the first one

      await evm.advanceTimeAndBlock(tenMinutes);
      await cryptoCrocodiles.connect(user1).layEgg(crocodileIdCreated);

      /*
      the user bought 1 egg, created 1 crocodile that should hace burned the egg
      the first laying should have created n new eggs with this crocodile (between 0 and 10)
      the second laying should have created n new egg
      so the new balance should be 2n then newBalance should be a value between 0 and 20
      */

      const eggBalance = await egg.balanceOf(user1.address);
      expect(eggBalance.gte(0)).to.be.true;
      expect(eggBalance.lte(20)).to.be.true;
    });
  });

  describe('eggs', () => {
    it('should only allow the CryptoCrocodiles contract to mint eggs', async () => {
      await expect(egg.connect(user1).mint(user1.address, 1)).to.be.revertedWith('OnlyCrocodilesCanMint()');
    });
  });

  describe('contract balance', () => {
    it('contract balance should increase when an egg is bought', async () => {
      await cryptoCrocodiles.connect(user1).buyEggs({ value: eggPrice });
      const contractBalance = await cryptoCrocodiles.getContractBalance();

      expect(contractBalance).to.be.equal(eggPrice);
    });
  });
});
