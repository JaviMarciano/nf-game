import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { MIN_DELAY } from '../helper-hardhat-config';

const deployTimeLock: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('TimeLock', {
    contract: 'contracts/TimeLock.sol:TimeLock',
    from: deployer,
    args: [MIN_DELAY, [], []],
    log: true,
  });
};

deployTimeLock.tags = ['TimeLock', 'all'];

export default deployTimeLock;
