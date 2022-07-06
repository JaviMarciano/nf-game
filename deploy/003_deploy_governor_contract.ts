import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { shouldVerifyContract } from 'utils/deploy';
import "@nomiclabs/hardhat-ethers";

const deployGovernor: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const egg = await ethers.getContract('Egg', deployer);
  const timeLock = await ethers.getContract('TimeLock', deployer);

  const cryptoCrocodilesAddress = await egg.Crocodiles();

  console.log('cryptoCrocodiles address: ', cryptoCrocodilesAddress);

  const governor = await deploy('CrocodilesGovernor', {
    contract: 'contracts/CrocodilesGovernor.sol:CrocodilesGovernor',
    from: deployer,
    args: [cryptoCrocodilesAddress, timeLock.address],
    log: true,
  });

  if (hre.network.name !== 'hardhat' && (await shouldVerifyContract(governor))) {
    console.log('verifying governor!!');
    await hre.run('verify:verify', {
      contract: 'contracts/CrocodilesGovernor.sol:CrocodilesGovernor',
      address: governor.address,
      constructorArguments: [cryptoCrocodilesAddress, timeLock.address],
    });
  }
};

deployGovernor.tags = ['governor', 'all'];

export default deployGovernor;
