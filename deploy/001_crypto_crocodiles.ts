import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { upgrades } from 'hardhat';
import { getImplementationAddress } from '@openzeppelin/upgrades-core';
import { ContractReceipt } from 'ethers';

const deployFunction: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts();
  const currentNonce: number = await ethers.provider.getTransactionCount(deployer);

  // precalculate the address of Egg contract
  const eggAddress: string = ethers.utils.getContractAddress({ from: deployer, nonce: currentNonce + 1 });

  const cryptoCrocodilesHelperArgs = [eggAddress];
  const cryptoCrocodilesFactory = await ethers.getContractFactory('CryptoCrocodiles');
  const cryptoCrocodiles = await upgrades.deployProxy(cryptoCrocodilesFactory, cryptoCrocodilesHelperArgs, { initializer: 'initialize', kind: 'uups' });
  const implementationAddress = await getImplementationAddress(ethers.provider, cryptoCrocodiles.address);

  if (hre.network.name !== 'hardhat') {
    await hre.run('verify:verify', {
      contract: 'contracts/CryptoCrocodiles.sol:CryptoCrocodiles',
      address: implementationAddress,
    });
  }

  const eggArgs = [cryptoCrocodiles.address];

  await hre.deployments.deploy('Egg', {
    contract: 'contracts/Egg.sol:Egg',
    from: deployer,
    args: eggArgs,
    log: true,
  });

  await delegate(cryptoCrocodiles.address, deployer);
};

const delegate = async (governanceTokenAddress: string, delegateAccount: string): Promise<ContractReceipt> => {
  const governanceToken = await ethers.getContractAt('CryptoCrocodiles', governanceTokenAddress);
  const delegateTx = await governanceToken.delegate(delegateAccount);
  return delegateTx.wait();
};

deployFunction.tags = ['CryptoCrocodiles', 'Egg', 'all'];

export default deployFunction;
