import {
  CrocodilesGovernor,
  CrocodilesGovernor__factory,
  CryptoCrocodiles,
  Egg,
  Egg__factory,
  TimeLock,
  TimeLock__factory,
} from '@typechained';
import { evm } from '@utils';
import { utils, BigNumber, ContractReceipt, ContractTransaction, ContractFactory } from 'ethers';
import { ethers } from 'hardhat';
import {
  CHANCE_PRICE_FUNCION,
  MIN_DELAY,
  PROPOSAL_DESCRIPTION,
  VOTING_DELAY,
  VOTING_PERIOD,
  WITHDRAW_DESCRIPTION,
  WITHDRAW_FUNCION,
} from 'helper-hardhat-config';
import { upgrades } from 'hardhat';
import { VoteType } from '@utils/enums';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';


const FORK_BLOCK_NUMBER = 11298165;

class GovernanceSetupHelper {
  governor: CrocodilesGovernor;
  cryptoCrocodiles: CryptoCrocodiles;
  egg: Egg;
  timeLock: TimeLock;
  eggPrecalculatedAddress: string;

  snapshotId: string;
  eggPrice: BigNumber;
  proposalId: string;

  encodedFunctionCall: string;

  async setup() {
    let deployer: SignerWithAddress;
    let proxyDeployer: SignerWithAddress;

    // factories
    let cryptoCrocodilesFactory: ContractFactory;
    let eggFactory: Egg__factory;
    let timeLockFactory: TimeLock__factory;
    let CrocodilesGovernorFactory: CrocodilesGovernor__factory;

    await evm.reset({
      jsonRpcUrl: process.env.RPC_ROPSTEN,
      blockNumber: FORK_BLOCK_NUMBER,
    });

    [proxyDeployer, deployer] = await ethers.getSigners();

    this.eggPrice = ethers.utils.parseEther('0.01');

    const currentNonce = await ethers.provider.getTransactionCount(proxyDeployer.address);
    this.eggPrecalculatedAddress = utils.getContractAddress({ from: proxyDeployer.address, nonce: currentNonce + 2 });

    cryptoCrocodilesFactory = await ethers.getContractFactory('CryptoCrocodiles');
    this.cryptoCrocodiles = (await upgrades.deployProxy(cryptoCrocodilesFactory, [this.eggPrecalculatedAddress], { initializer: 'initialize', kind: 'uups' })) as CryptoCrocodiles;
    eggFactory = (await ethers.getContractFactory('Egg')) as Egg__factory;
    this.egg = await eggFactory.deploy(this.cryptoCrocodiles.address);

    timeLockFactory = (await ethers.getContractFactory('TimeLock')) as TimeLock__factory;
    this.timeLock = await timeLockFactory.deploy(MIN_DELAY, [], []);

    CrocodilesGovernorFactory = (await ethers.getContractFactory('CrocodilesGovernor')) as CrocodilesGovernor__factory;
    this.governor = await CrocodilesGovernorFactory.deploy(this.cryptoCrocodiles.address, this.timeLock.address);

    this.setupTimeLockRoles(deployer.address);

    //Transferring ownership to timeLock
    await this.cryptoCrocodiles.connect(proxyDeployer).transferOwnership(this.timeLock.address);

    // snapshot
    this.snapshotId = await evm.snapshot.take();
  }

  async addVoter(user: SignerWithAddress, votingPower: number): Promise<ContractReceipt> {
    const eggPrice = ethers.utils.parseEther((0.01 * votingPower).toString());
    await this.cryptoCrocodiles.connect(user).buyEggs({ value: eggPrice });
    for (let i = 0; i < votingPower; i++) {
      const connectTx = await this.cryptoCrocodiles.connect(user).create();
      await connectTx.wait();
    }
    const delagateTx = await this.cryptoCrocodiles.connect(user).delegate(user.address);
    return delagateTx.wait();
  };

  async castVote(proposalId: string, user: SignerWithAddress, voteType: VoteType): Promise<ContractReceipt> {
    const voteTx = await this.governor.connect(user).castVote(proposalId, voteType);
    return voteTx.wait();
  };

  async createChangePriceProposal(): Promise<string> {
    const oneEther = ethers.utils.parseEther('1');
    this.encodedFunctionCall = this.cryptoCrocodiles.interface.encodeFunctionData(CHANCE_PRICE_FUNCION, [oneEther]);
    return this.createProposal(PROPOSAL_DESCRIPTION, this.encodedFunctionCall);
  };

  async createWithdeawProposal(address: string): Promise<string> {
    this.encodedFunctionCall = this.cryptoCrocodiles.interface.encodeFunctionData(WITHDRAW_FUNCION, [address]);
    return this.createProposal(WITHDRAW_DESCRIPTION, this.encodedFunctionCall);
  };

  private async createProposal(description: string, encodedFunctionCall: string): Promise<string> {
    const proposeTx = await this.governor.propose([this.cryptoCrocodiles.address], [0], [encodedFunctionCall], description);
    const proposeReceipt = await proposeTx.wait();
    let proposalId = proposeReceipt.events![0].args!.proposalId;
    await evm.advanceBlocks(VOTING_DELAY);
    return proposalId.toString();
  }

  executeChangePriceProposal(): Promise<ContractTransaction> {
    return this.executeProposal(PROPOSAL_DESCRIPTION);
  };

  executeWithdrawProposal(): Promise<ContractTransaction> {
    return this.executeProposal(WITHDRAW_DESCRIPTION);
  };

  queueWithdrawProposal(): Promise<ContractReceipt> {
    return this.queueProposal(WITHDRAW_DESCRIPTION);
  };

  queueChangePriceProposal(): Promise<ContractReceipt> {
    return this.queueProposal(PROPOSAL_DESCRIPTION);
  };

  advanceVotingPeriod(): Promise<void> {
    return evm.advanceBlocks(VOTING_PERIOD);
  };

  advanceVotingDelay(): Promise<void> {
    return evm.advanceBlocks(VOTING_DELAY);
  };

  advanceMinDelay(): Promise<void> {
    return evm.advanceBlocks(MIN_DELAY);
  };

  private async queueProposal(description: string): Promise<ContractReceipt> {
    const descriptionHash = ethers.utils.id(description);
    const queueTx = await this.governor.queue([this.cryptoCrocodiles.address], [0], [this.encodedFunctionCall], descriptionHash);
    return queueTx.wait();
  };

  private async executeProposal(description: string): Promise<ContractTransaction> {
    const descriptionHash = ethers.utils.id(description);
    return this.governor.execute([this.cryptoCrocodiles.address], [0], [this.encodedFunctionCall], descriptionHash);
  };

  private async setupTimeLockRoles(deployerAddress: string): Promise<void> {
    const proposerRole = await this.timeLock.PROPOSER_ROLE();
    const executorRole = await this.timeLock.EXECUTOR_ROLE();
    const adminRole = await this.timeLock.TIMELOCK_ADMIN_ROLE();

    const proposerTx = await this.timeLock.grantRole(proposerRole, this.governor.address);
    await proposerTx.wait();

    //giving the executor role to everybody
    const executorTx = await this.timeLock.grantRole(executorRole, ethers.constants.AddressZero);
    await executorTx.wait();

    //revoking deployer address the admin role in order to avoid centraliced power
    const revokeTx = await this.timeLock.revokeRole(adminRole, deployerAddress);
    await revokeTx.wait();
  }
}

export const governanceSetupHelper = new GovernanceSetupHelper();
