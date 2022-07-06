import { expect } from 'chai';
import { evm } from '@utils';
import { ethers } from 'hardhat';
import { governanceSetupHelper as helper } from './governance-setup';
import { ProposalState, VoteType } from '@utils/enums';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const FORK_BLOCK_NUMBER = 11298165;

describe('Governance', function () {
  // signers
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let userWithdraw: SignerWithAddress;

  let snapshotId: string;
  let proposalId: string;

  before(async () => {
    // forking mainnet
    await evm.reset({
      jsonRpcUrl: process.env.RPC_ROPSTEN,
      blockNumber: FORK_BLOCK_NUMBER,
    });

    // getting signers with ETH
    [deployer, user1, user2, user3, userWithdraw] = await ethers.getSigners();

    // snapshot
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });


  describe('voting count', async () => {
    beforeEach(async () => {
      await helper.setup();
      await helper.addVoter(deployer, 1);
      await helper.addVoter(user1, 1);
      await helper.addVoter(user3, 2);

      //creating proposal
      proposalId = await helper.createChangePriceProposal();
    });

    it('only crocodile holders should be able to vote', async () => {
      await helper.castVote(proposalId, user2, VoteType.For);

      const votes = await helper.governor.proposalVotes(proposalId);

      expect(votes.againstVotes).to.be.equal(0);
      expect(votes.forVotes).to.be.equal(0);
      expect(votes.abstainVotes).to.be.equal(0);
    });

    it('the voting power of a two crocodiles holder should be two', async () => {
      await helper.castVote(proposalId, user3, VoteType.For);

      const votes = await helper.governor.proposalVotes(proposalId);

      expect(votes.againstVotes).to.be.equal(0);
      expect(votes.forVotes).to.be.equal(2);
      expect(votes.abstainVotes).to.be.equal(0);
    });

    it('one against vote should increase the against count', async () => {
      await helper.castVote(proposalId, user1, VoteType.Against);

      const votes = await helper.governor.proposalVotes(proposalId);

      expect(votes.againstVotes).to.be.equal(1);
      expect(votes.forVotes).to.be.equal(0);
      expect(votes.abstainVotes).to.be.equal(0);
    });

    it('one abstain vote should increase the abstain count', async () => {
      await helper.castVote(proposalId, user1, VoteType.Abstain);

      const votes = await helper.governor.proposalVotes(proposalId);

      expect(votes.againstVotes).to.be.equal(0);
      expect(votes.forVotes).to.be.equal(0);
      expect(votes.abstainVotes).to.be.equal(1);
    });

    it('one for vote should increase the for count', async () => {
      await helper.castVote(proposalId, user1, VoteType.For);

      const votes = await helper.governor.proposalVotes(proposalId);

      expect(votes.againstVotes).to.be.equal(0);
      expect(votes.forVotes).to.be.equal(1);
      expect(votes.abstainVotes).to.be.equal(0);
    });

    it('an crocodile holder should be able to vote only once', async () => {
      await helper.castVote(proposalId, user1, VoteType.For);
      await expect(helper.castVote(proposalId, user1, VoteType.For)).to.be.revertedWith('GovernorVotingSimple: vote already cast');
    });

    it('creating crocodiles after a proposal is created should not increase voting power', async () => {
      await helper.addVoter(user2, 10);
      await helper.castVote(proposalId, user2, VoteType.For);

      const votes = await helper.governor.proposalVotes(proposalId);

      expect(votes.againstVotes).to.be.equal(0);
      expect(votes.forVotes).to.be.equal(0);
      expect(votes.abstainVotes).to.be.equal(0);
    });
  });

  describe('voting state', async () => {
    beforeEach(async () => {
      await helper.setup();

      //Creating voters
      await helper.addVoter(user1, 1);
      await helper.addVoter(user2, 1);
      await helper.addVoter(user3, 2);

      /* ==========================================
      Total supply 4
      user1: 1 
      user1: 1 
      user3: 2
      ========================================== */

      proposalId = await helper.createChangePriceProposal();
      await helper.advanceVotingDelay();
    });

    it('reaching quorum (50%) of for should change the proposal state to succeeded after the voting period', async () => {
      //Voting
      await helper.castVote(proposalId, user1, VoteType.For);
      await helper.castVote(proposalId, user2, VoteType.For);

      //Getting votes
      const votes = await helper.governor.proposalVotes(proposalId);
      expect(votes.forVotes).to.be.equal(2);

      await helper.advanceVotingPeriod();

      //Checking the state
      const proposalState = await helper.governor.state(proposalId);
      expect(proposalState).to.be.equal(ProposalState.Succeeded);
    });

    it('reaching quorum (50%) of against should change the proposal state to defeated after the voting period', async () => {
      //Voting
      await helper.castVote(proposalId, user1, VoteType.Against);
      await helper.castVote(proposalId, user2, VoteType.Against);

      //Getting votes
      const votes = await helper.governor.proposalVotes(proposalId);
      expect(votes.againstVotes).to.be.equal(2);

      await helper.advanceVotingPeriod();

      //Checking the state
      const proposalState = await helper.governor.state(proposalId);
      expect(proposalState).to.be.equal(ProposalState.Defeated);
    });

    it('proposal state should be active during the voting period even when the proposal quorum is achieved', async () => {
      //Voting
      await helper.castVote(proposalId, user1, VoteType.For);
      await helper.castVote(proposalId, user3, VoteType.For);

      //Getting votes
      const votes = await helper.governor.proposalVotes(proposalId);
      expect(votes.forVotes).to.be.equal(3);

      //Checking the state
      const proposalState = await helper.governor.state(proposalId);
      expect(proposalState).to.be.equal(ProposalState.Active);
    });
  });

  describe('change price', async () => {
    beforeEach(async () => {
      await helper.setup();
    });

    it('change price should succeed after the succeeded voting', async () => {
      const oneEther = ethers.utils.parseEther('1');

      //setup voting
      await helper.addVoter(user1, 2);
      await helper.addVoter(user2, 1);

      proposalId = await helper.createChangePriceProposal();
      await helper.advanceVotingDelay();

      await helper.castVote(proposalId, user1, VoteType.For);
      await helper.castVote(proposalId, user2, VoteType.For);
      await helper.advanceVotingPeriod();

      await helper.queueChangePriceProposal();
      await helper.advanceMinDelay();

      await helper.executeChangePriceProposal();

      const newPrice = await helper.cryptoCrocodiles.eggPrice();
      expect(newPrice).to.be.equal(oneEther);
    });

    it('defeated proposal should fail on enqueue attempt', async () => {
      //setup voting
      await helper.addVoter(user1, 2);
      await helper.addVoter(user2, 1);

      proposalId = await helper.createChangePriceProposal();
      await helper.advanceVotingDelay();

      await helper.castVote(proposalId, user1, VoteType.Against);
      await helper.castVote(proposalId, user2, VoteType.Against);
      await helper.advanceVotingPeriod();

      await expect(helper.queueChangePriceProposal()).to.be.revertedWith('Governor: proposal not successful');
    });

    it('egg price can only be changed through governance', async () => {
      await expect(helper.cryptoCrocodiles.connect(deployer).changePrice(55)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('withdrawal', async () => {
    beforeEach(async () => {
      await helper.setup();
    });

    it('withdrawal should only be possible through governance', async () => {
      await expect(helper.cryptoCrocodiles.connect(deployer).withdraw(deployer.address)).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('withdrawal should succeed after the succeeded voting', async () => {
      const balancePreviousToWithdraw = await ethers.provider.getBalance(userWithdraw.address);

      //setup voting
      await helper.addVoter(user1, 2);
      await helper.addVoter(user2, 1);
      proposalId = await helper.createWithdeawProposal(userWithdraw.address);
      await helper.advanceVotingDelay();

      await helper.castVote(proposalId, user1, VoteType.For);
      await helper.castVote(proposalId, user2, VoteType.For);
      await helper.advanceVotingPeriod();

      await helper.queueWithdrawProposal();
      await helper.advanceMinDelay();

      await helper.executeWithdrawProposal();

      const newUserBalance = await ethers.provider.getBalance(userWithdraw.address);
      const withdraw = ethers.utils.formatEther(newUserBalance.sub(balancePreviousToWithdraw));
      expect(withdraw).to.be.equal('0.018');
    });

    it('should emit withdrawal when funds are withdrawn ', async () => {
      //setup voting
      await helper.addVoter(user1, 2);
      await helper.addVoter(user2, 1);

      proposalId = await helper.createWithdeawProposal(userWithdraw.address);
      await helper.advanceVotingDelay();

      await helper.castVote(proposalId, user1, VoteType.For);
      await helper.castVote(proposalId, user2, VoteType.For);
      await helper.advanceVotingPeriod();

      await helper.queueWithdrawProposal();
      await helper.advanceMinDelay();

      await expect(await helper.executeWithdrawProposal()).to.emit(helper.cryptoCrocodiles, 'Withdrawal');
    });
  });
});
