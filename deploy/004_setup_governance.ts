import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const setupContracts: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const timeLock = await ethers.getContract('TimeLock', deployer);
  const governor = await ethers.getContract('CrocodilesGovernor', deployer);

  const proposerRole = await timeLock.PROPOSER_ROLE();
  const executorRole = await timeLock.EXECUTOR_ROLE();
  const adminRole = await timeLock.TIMELOCK_ADMIN_ROLE();

  const proposerTx = await timeLock.grantRole(proposerRole, governor.address);
  await proposerTx.wait();

  //giving the executor role to everybody
  const executorTx = await timeLock.grantRole(executorRole, ethers.constants.AddressZero);
  await executorTx.wait();

  //revoking deployer address the admin role in order to avoid centraliced power
  const revokeTx = await timeLock.revokeRole(adminRole, deployer);
  await revokeTx.wait();
};

setupContracts.tags = ['setup', 'all'];

export default setupContracts;
