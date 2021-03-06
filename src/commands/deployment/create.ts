import commander from "commander";
import {
  addSrcToACRPipeline,
  DeploymentTable,
  updateACRToHLDPipeline,
  updateHLDToManifestPipeline,
  updateManifestCommitId,
} from "../../lib/azure/deploymenttable";
import { build as buildCmd, exit as exitCmd } from "../../lib/commandBuilder";
import { hasValue } from "../../lib/validator";
import { logger } from "../../logger";
import decorator from "./create.decorator.json";

/**
 * Command Line values from the commander
 */
export interface CommandOptions {
  accessKey: string | undefined;
  commitId: string | undefined;
  env: string | undefined;
  hldCommitId: string | undefined;
  imageTag: string | undefined;
  manifestCommitId: string | undefined;
  name: string | undefined;
  p1: string | undefined;
  p2: string | undefined;
  p3: string | undefined;
  pr: string | undefined;
  partitionKey: string | undefined;
  service: string | undefined;
  tableName: string | undefined;
  repository: string | undefined;
}

/**
 * Validates that the required values are provided.
 *
 * @param opts values from commander
 */
export const validateValues = (opts: CommandOptions): void => {
  if (
    !hasValue(opts.accessKey) ||
    !hasValue(opts.name) ||
    !hasValue(opts.partitionKey) ||
    !hasValue(opts.tableName)
  ) {
    throw new Error(
      "Access key, storage account name, partition key and/or table name are not provided"
    );
  }
};

export const handlePipeline1 = async (
  tableInfo: DeploymentTable,
  opts: CommandOptions
): Promise<void> => {
  if (
    !hasValue(opts.imageTag) ||
    !hasValue(opts.commitId) ||
    !hasValue(opts.service)
  ) {
    throw new Error(
      "For updating the details of source pipeline, you must specify --image-tag, --commit-id and --service"
    );
  }
  await addSrcToACRPipeline(
    tableInfo,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    opts.p1!,
    opts.imageTag,
    opts.service,
    opts.commitId,
    opts.repository
  );
};

export const handlePipeline2 = async (
  tableInfo: DeploymentTable,
  opts: CommandOptions
): Promise<void> => {
  if (
    !hasValue(opts.hldCommitId) ||
    !hasValue(opts.env) ||
    !hasValue(opts.imageTag)
  ) {
    throw new Error(
      "For updating the details of image tag release pipeline, you must specify --p2, --hld-commit-id, --image-tag and --env"
    );
  }
  await updateACRToHLDPipeline(
    tableInfo,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    opts.p2!,
    opts.imageTag,
    opts.hldCommitId,
    opts.env,
    opts.pr,
    opts.repository
  );
};

/**
 * Executes the command, can all exit function with 0 or 1
 * when command completed successfully or failed respectively.
 *
 * @param opts validated option values
 * @param exitFn exit function
 */
export const execute = async (
  opts: CommandOptions,
  exitFn: (status: number) => Promise<void>
): Promise<void> => {
  try {
    validateValues(opts);

    const tableInfo: DeploymentTable = {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      accountKey: opts.accessKey!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      accountName: opts.name!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      partitionKey: opts.partitionKey!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      tableName: opts.tableName!,
    };

    if (hasValue(opts.p1)) {
      await handlePipeline1(tableInfo, opts);
    } else if (hasValue(opts.p2)) {
      await handlePipeline2(tableInfo, opts);
    } else if (hasValue(opts.p3) && hasValue(opts.hldCommitId)) {
      await updateHLDToManifestPipeline(
        tableInfo,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        opts.hldCommitId!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        opts.p3!,
        opts.manifestCommitId,
        opts.pr,
        opts.repository
      );
    } else if (hasValue(opts.p3) && hasValue(opts.manifestCommitId)) {
      await updateManifestCommitId(
        tableInfo,
        opts.p3,
        opts.manifestCommitId,
        opts.repository
      );
    } else {
      throw new Error("No action could be performed for specified arguments.");
    }
    await exitFn(0);
  } catch (err) {
    logger.error(err);
    await exitFn(1);
  }
};

/**
 * Creates a create command decorator for the command to update a deployment in storage
 * @param command
 */
export const commandDecorator = (command: commander.Command): void => {
  buildCmd(command, decorator).action(async (opts: CommandOptions) => {
    await execute(opts, async (status: number) => {
      await exitCmd(logger, process.exit, status);
    });
  });
};
