/* eslint-disable @typescript-eslint/no-use-before-define */
import * as azure from "azure-storage";
import uuid from "uuid/v4";
import { logger } from "../../logger";
/**
 * Deployment Table interface to hold necessary information about a table for deployments
 */
export interface DeploymentTable {
  accountName: string;
  accountKey: string;
  tableName: string;
  partitionKey: string;
}

/**
 * Row interface to hold necessary information about SRC -> ACR entry
 */
export interface RowSrcToACRPipeline {
  PartitionKey: string;
  RowKey: string;
  commitId: string;
  imageTag: string;
  p1: string;
  service: string;
  sourceRepo?: string;
}

/**
 * Row interface to add ACR -> HLD entry
 */
export interface RowACRToHLDPipeline extends RowSrcToACRPipeline {
  p2: string;
  hldCommitId: string;
  env: string;
  pr?: string;
  hldRepo?: string;
}

/**
 * Row interface to hold necessary information about SRC -> ACR entry
 */
export interface EntrySRCToACRPipeline {
  RowKey: string;
  PartitionKey: string;
  commitId: string;
  imageTag: string;
  service: string;
  sourceRepo?: string;
  p1: {
    _: string;
  };
  env: {
    _: string;
  };
}

/**
 * Row interface to hold necessary information about ACR -> HLD entry
 */
export interface EntryACRToHLDPipeline {
  RowKey: string;
  PartitionKey: string;
  commitId: string;
  imageTag: string;
  sourceRepo?: string;
  hldRepo?: string;
  p1: string;
  service: string;
  p2: {
    _: string;
  };
  hldCommitId: {
    _: string;
  };
  env: {
    _: string;
  };
}

/**
 * Row interface to hold necessary information about HLD -> Manifest entry
 */
export interface RowHLDToManifestPipeline extends RowACRToHLDPipeline {
  p3: string;
  manifestCommitId?: string;
  manifestRepo?: string;
}

/**
 * Row interface to hold necessary information about HLD -> Manifest entry
 */
export interface EntryHLDToManifestPipeline {
  RowKey: string;
  PartitionKey: string;
  commitId: string;
  env: string;
  imageTag: string;
  p1: string;
  service: string;
  p2: string;
  hldCommitId: string;
  p3: {
    _: string;
  };
  manifestCommitId: {
    _: string;
  };
  sourceRepo?: string;
  hldRepo?: string;
  manifestRepo?: string;
}

/**
 * Row interface to hold necessary information Manifest update entry
 */
export interface RowManifest extends RowHLDToManifestPipeline {
  manifestCommitId: string;
  manifestRepo?: string;
}

/**
 * Gets the azure table service
 * @param tableInfo tableInfo object containing necessary table info
 */
export const getTableService = (
  tableInfo: DeploymentTable
): azure.TableService => {
  return azure.createTableService(tableInfo.accountName, tableInfo.accountKey);
};

/**
 * Adds a new deployment in storage for SRC to ACR pipeline.
 *
 * @param tableInfo table info interface containing information about the storage for deployments
 * @param pipelineId Identifier of the first pipeline
 * @param imageTag image tag name
 * @param serviceName service name
 * @param commitId commit identifier
 */
export const addSrcToACRPipeline = async (
  tableInfo: DeploymentTable,
  pipelineId: string,
  imageTag: string,
  serviceName: string,
  commitId: string,
  repository?: string
): Promise<RowSrcToACRPipeline> => {
  const entry: RowSrcToACRPipeline = {
    PartitionKey: tableInfo.partitionKey,
    RowKey: getRowKey(),
    commitId,
    imageTag,
    p1: pipelineId,
    service: serviceName,
  };
  if (repository) {
    entry.sourceRepo = repository.toLowerCase();
  }
  await insertToTable(tableInfo, entry);
  logger.info("Added first pipeline details to the database");
  return entry;
};

/**
 * Updates an existing SRC -> ACR entry with its corresponding ACR -> HLD entry
 * @param entries list of entries found
 * @param tableInfo table info object
 * @param pipelineId Id of the ACR -> HLD pipeline
 * @param imageTag image tag name
 * @param hldCommitId HLD commit Id
 * @param env environment name
 * @param pr Pull request Id (if available)
 */
export const updateMatchingArcToHLDPipelineEntry = async (
  entries: EntryACRToHLDPipeline[],
  tableInfo: DeploymentTable,
  pipelineId: string,
  imageTag: string,
  hldCommitId: string,
  env: string,
  pr?: string,
  repository?: string
): Promise<RowACRToHLDPipeline | null> => {
  const found = (entries || []).find((entry: EntryACRToHLDPipeline) => {
    return (
      (entry.p2 ? entry.p2._ === pipelineId : true) &&
      (entry.hldCommitId ? entry.hldCommitId._ === hldCommitId : true) &&
      (entry.env ? entry.env._ === env : true)
    );
  });

  if (found) {
    const updateEntry: RowACRToHLDPipeline = {
      PartitionKey: found.PartitionKey,
      RowKey: found.RowKey,
      commitId: found.commitId,
      env: env.toLowerCase(),
      hldCommitId: hldCommitId.toLowerCase(),
      imageTag: found.imageTag,
      p1: found.p1,
      p2: pipelineId.toLowerCase(),
      service: found.service,
      sourceRepo: found.sourceRepo,
    };
    if (pr) {
      updateEntry.pr = pr.toLowerCase();
    }
    if (repository) {
      updateEntry.hldRepo = repository.toLowerCase();
    }
    await updateEntryInTable(tableInfo, updateEntry);
    logger.info(
      `Added new p2 entry for imageTag ${imageTag} by finding corresponding entry`
    );
    return updateEntry;
  }
  return null;
};

/**
 * Creates a new copy of an existing SRC -> ACR entry when a release is created for a
 * corresponding entry that already has an existing release
 * For eg. when the user manually creates a ACR -> HLD release for an existing image tag.
 * @param entries list of entries found
 * @param tableInfo table info object
 * @param pipelineId Id of the ACR -> HLD pipeline
 * @param imageTag image tag name
 * @param hldCommitId HLD commit Id
 * @param env environment name
 * @param pr Pull request Id (if available)
 */
export const updateLastRowOfArcToHLDPipelines = async (
  entries: EntryACRToHLDPipeline[],
  tableInfo: DeploymentTable,
  pipelineId: string,
  imageTag: string,
  hldCommitId: string,
  env: string,
  pr?: string,
  repository?: string
): Promise<RowACRToHLDPipeline> => {
  const lastEntry = entries[entries.length - 1];
  const last: RowACRToHLDPipeline = {
    PartitionKey: lastEntry.PartitionKey,
    RowKey: getRowKey(),
    commitId: lastEntry.commitId,
    env: env.toLowerCase(),
    hldCommitId: hldCommitId.toLowerCase(),
    imageTag: lastEntry.imageTag,
    p1: lastEntry.p1,
    p2: pipelineId.toLowerCase(),
    service: lastEntry.service,
    sourceRepo: lastEntry.sourceRepo,
  };
  if (pr) {
    last.pr = pr.toLowerCase();
  }
  if (repository) {
    last.hldRepo = repository.toLowerCase();
  }
  await insertToTable(tableInfo, last);
  logger.info(
    `Added new p2 entry for imageTag ${imageTag} by finding a similar entry`
  );
  return last;
};

/**
 * Adds a new entry for ACR -> HLD pipeline when no corresponding SRC -> ACR pipeline was found
 * to be associated
 * This should only be used in error scenarios or when the corresponding SRC -> ACR build is
 * deleted from storage
 * @param tableInfo table info object
 * @param pipelineId Id of the ACR -> HLD pipeline
 * @param imageTag image tag name
 * @param hldCommitId HLD commit Id
 * @param env environment name
 * @param pr Pull request Id (if available)
 */
export const addNewRowToArcToHLDPipelines = async (
  tableInfo: DeploymentTable,
  pipelineId: string,
  imageTag: string,
  hldCommitId: string,
  env: string,
  pr?: string,
  repository?: string
): Promise<RowACRToHLDPipeline> => {
  const newEntry: RowACRToHLDPipeline = {
    PartitionKey: tableInfo.partitionKey,
    RowKey: getRowKey(),
    commitId: "",
    env: env.toLowerCase(),
    hldCommitId: hldCommitId.toLowerCase(),
    imageTag: imageTag.toLowerCase(),
    p1: "",
    p2: pipelineId.toLowerCase(),
    service: "",
  };
  if (pr) {
    newEntry.pr = pr.toLowerCase();
  }
  if (repository) {
    newEntry.hldRepo = repository.toLowerCase();
  }
  await insertToTable(tableInfo, newEntry);
  logger.info(
    `Added new p2 entry for imageTag ${imageTag} - no matching entry was found.`
  );
  return newEntry;
};

/**
 * Updates the ACR to HLD pipeline in the storage by finding its corresponding SRC to ACR pipeline
 * @param tableInfo table info interface containing information about the storage for deployments
 * @param pipelineId identifier for the ACR to HLD pipeline
 * @param imageTag image tag name
 * @param hldCommitId commit identifier into HLD
 * @param env environment name, such as Dev, Staging etc.
 */
export const updateACRToHLDPipeline = async (
  tableInfo: DeploymentTable,
  pipelineId: string,
  imageTag: string,
  hldCommitId: string,
  env: string,
  pr?: string,
  repository?: string
): Promise<RowACRToHLDPipeline> => {
  const entries = await findMatchingDeployments<EntryACRToHLDPipeline>(
    tableInfo,
    "imageTag",
    imageTag
  );

  // 1. try to find the matching entry.
  if (entries && entries.length > 0) {
    const found = await updateMatchingArcToHLDPipelineEntry(
      entries,
      tableInfo,
      pipelineId,
      imageTag,
      hldCommitId,
      env,
      pr,
      repository
    );

    if (found) {
      return found;
    }

    // 2. when cannot find the entry, we take the last row and INSERT it.
    // TODO: rethink this logic.
    return await updateLastRowOfArcToHLDPipelines(
      entries,
      tableInfo,
      pipelineId,
      imageTag,
      hldCommitId,
      env,
      pr,
      repository
    );
  }

  // Fallback: Ideally we should not be getting here, because there should
  // always be a p1 for any p2 being created.
  // TODO: rethink this logic.
  return await addNewRowToArcToHLDPipelines(
    tableInfo,
    pipelineId,
    imageTag,
    hldCommitId,
    env,
    pr,
    repository
  );
};

/**
 * Updates the HLD to manifest pipeline in storage by finding its
 * corresponding SRC to ACR and ACR to HLD pipelines
 * Depending on whether PR is specified or not, it performs a lookup
 * on commit Id and PR to link it to the previous release.
 *
 * @param tableInfo table info interface containing information about
 *        the deployment storage table
 * @param hldCommitId commit identifier into the HLD repo, used as a
 *        filter to find corresponding deployments
 * @param pipelineId identifier of the HLD to manifest pipeline
 * @param manifestCommitId manifest commit identifier
 * @param pr pull request identifier
 */
export const updateHLDToManifestPipeline = async (
  tableInfo: DeploymentTable,
  hldCommitId: string,
  pipelineId: string,
  manifestCommitId?: string,
  pr?: string,
  repository?: string
): Promise<RowHLDToManifestPipeline> => {
  let entries = await findMatchingDeployments<EntryHLDToManifestPipeline>(
    tableInfo,
    "hldCommitId",
    hldCommitId
  );

  // cannot find entries by hldCommitId.
  // attempt to find entries by pr
  if ((!entries || entries.length === 0) && pr) {
    entries = await findMatchingDeployments<EntryHLDToManifestPipeline>(
      tableInfo,
      "pr",
      pr
    );
  }
  return updateHLDtoManifestHelper(
    entries,
    tableInfo,
    hldCommitId,
    pipelineId,
    manifestCommitId,
    pr,
    repository
  );
};

/**
 * Updates HLD -> Manifest build for its corresponding ACR -> HLD release
 * @param entries list of matching entries based on PR / hld commit
 * @param tableInfo table info interface containing information about
 *        the deployment storage table
 * @param hldCommitId commit identifier into the HLD repo, used as a
 *        filter to find corresponding deployments
 * @param pipelineId identifier of the HLD to manifest pipeline
 * @param manifestCommitId manifest commit identifier
 * @param pr pull request identifier
 */
export const updateHLDtoManifestEntry = async (
  entries: EntryHLDToManifestPipeline[],
  tableInfo: DeploymentTable,
  hldCommitId: string,
  pipelineId: string,
  manifestCommitId?: string,
  pr?: string,
  repository?: string
): Promise<RowHLDToManifestPipeline | null> => {
  const found = entries.find(
    (entry: EntryHLDToManifestPipeline) =>
      (entry.p3 ? entry.p3._ === pipelineId : true) &&
      (entry.manifestCommitId
        ? entry.manifestCommitId._ === manifestCommitId
        : true)
  );

  if (found) {
    const entry: RowHLDToManifestPipeline = {
      PartitionKey: found.PartitionKey,
      RowKey: found.RowKey,
      commitId: found.commitId,
      env: found.env,
      hldCommitId,
      hldRepo: found.hldRepo,
      imageTag: found.imageTag,
      p1: found.p1,
      p2: found.p2,
      p3: pipelineId.toLowerCase(),
      service: found.service,
      sourceRepo: found.sourceRepo,
    };
    if (manifestCommitId) {
      entry.manifestCommitId = manifestCommitId.toLowerCase();
    }
    if (pr) {
      entry.pr = pr;
    }
    if (repository) {
      entry.manifestRepo = repository.toLowerCase();
    }
    await updateEntryInTable(tableInfo, entry);
    logger.info(
      "Updated third pipeline details for its corresponding pipeline"
    );
    return entry;
  }
  return null;
};

/**
 * Creates a new copy of an existing ACR -> HLD entry when a build is created for a
 * corresponding entry that already has an existing build
 * For eg. when the user manually triggers a HLD -> Manifest build for the last existing HLD
 * commit.
 * @param entries list of matching entries based on PR / hld commit
 * @param tableInfo table info interface containing information about
 *        the deployment storage table
 * @param hldCommitId commit identifier into the HLD repo, used as a
 *        filter to find corresponding deployments
 * @param pipelineId identifier of the HLD to manifest pipeline
 * @param manifestCommitId manifest commit identifier
 * @param pr pull request identifier
 */
export const updateLastHLDtoManifestEntry = async (
  entries: EntryHLDToManifestPipeline[],
  tableInfo: DeploymentTable,
  hldCommitId: string,
  pipelineId: string,
  manifestCommitId?: string,
  pr?: string,
  repository?: string
): Promise<RowHLDToManifestPipeline> => {
  const lastEntry = entries[entries.length - 1];
  const newEntry: RowHLDToManifestPipeline = {
    PartitionKey: lastEntry.PartitionKey,
    RowKey: getRowKey(),
    commitId: lastEntry.commitId,
    env: lastEntry.env,
    hldCommitId: hldCommitId.toLowerCase(),
    hldRepo: lastEntry.hldRepo,
    imageTag: lastEntry.imageTag,
    p1: lastEntry.p1,
    p2: lastEntry.p2,
    p3: pipelineId.toLowerCase(),
    service: lastEntry.service,
    sourceRepo: lastEntry.sourceRepo,
  };
  if (manifestCommitId) {
    newEntry.manifestCommitId = manifestCommitId.toLowerCase();
  }
  if (pr) {
    newEntry.pr = pr.toLowerCase();
  }
  if (repository) {
    newEntry.manifestRepo = repository.toLowerCase();
  }

  await insertToTable(tableInfo, newEntry);
  logger.info(
    `Added new p3 entry for hldCommitId ${hldCommitId} by finding a similar entry`
  );
  return newEntry;
};

/**
 * Adds a new row to the table when the HLD -> Manifest pipeline is triggered by
 * manually committing into the HLD
 * @param tableInfo table info interface containing information about
 *        the deployment storage table
 * @param hldCommitId commit identifier into the HLD repo, used as a
 *        filter to find corresponding deployments
 * @param pipelineId identifier of the HLD to manifest pipeline
 * @param manifestCommitId manifest commit identifier
 * @param pr pull request identifier
 */
export const addNewRowToHLDtoManifestPipeline = async (
  tableInfo: DeploymentTable,
  hldCommitId: string,
  pipelineId: string,
  manifestCommitId?: string,
  pr?: string,
  repository?: string
): Promise<RowHLDToManifestPipeline> => {
  const newEntry: RowHLDToManifestPipeline = {
    PartitionKey: tableInfo.partitionKey,
    RowKey: getRowKey(),
    commitId: "",
    env: "",
    hldCommitId: hldCommitId.toLowerCase(),
    imageTag: "",
    p1: "",
    p2: "",
    p3: pipelineId.toLowerCase(),
    service: "",
  };
  if (manifestCommitId) {
    newEntry.manifestCommitId = manifestCommitId.toLowerCase();
  }
  if (pr) {
    newEntry.pr = pr.toLowerCase();
  }
  if (repository) {
    newEntry.manifestRepo = repository.toLowerCase();
  }
  await insertToTable(tableInfo, newEntry);
  logger.info(
    `Added new p3 entry for hldCommitId ${hldCommitId} - no matching entry was found.`
  );
  return newEntry;
};

/**
 * Updates HLD to Manifest pipeline in storage by going through entries that could
 * be a possible match in the storage.
 *
 * @param entries list of entries that this build could be linked to
 * @param tableInfo table info interface containing information about the
 *        deployment storage table
 * @param hldCommitId commit identifier into the HLD repo, used as a filter
 *        to find corresponding deployments
 * @param pipelineId identifier of the HLD to manifest pipeline
 * @param manifestCommitId manifest commit identifier
 * @param pr pull request identifier
 */
export const updateHLDtoManifestHelper = async (
  entries: EntryHLDToManifestPipeline[],
  tableInfo: DeploymentTable,
  hldCommitId: string,
  pipelineId: string,
  manifestCommitId?: string,
  pr?: string,
  repository?: string
): Promise<RowHLDToManifestPipeline> => {
  if (entries && entries.length > 0) {
    const updated = await updateHLDtoManifestEntry(
      entries,
      tableInfo,
      hldCommitId,
      pipelineId,
      manifestCommitId,
      pr,
      repository
    );

    if (updated) {
      return updated;
    }

    // 2. when cannot find the entry, we take the last row and INSERT it.
    // TODO: rethink this logic.
    return await updateLastHLDtoManifestEntry(
      entries,
      tableInfo,
      hldCommitId,
      pipelineId,
      manifestCommitId,
      pr,
      repository
    );
  }

  // Fallback: Ideally we should not be getting here, because there should
  // always matching entry
  // TODO: rethink this logic.
  return await addNewRowToHLDtoManifestPipeline(
    tableInfo,
    hldCommitId,
    pipelineId,
    manifestCommitId,
    pr,
    repository
  );
};

/**
 * Updates manifest commit identifier in the storage for a pipeline identifier in HLD to manifest pipeline
 * @param tableInfo table info interface containing information about the deployment storage table
 * @param pipelineId identifier of the HLD to manifest pipeline, used as a filter to find the deployment
 * @param manifestCommitId manifest commit identifier to be updated
 */
export const updateManifestCommitId = async (
  tableInfo: DeploymentTable,
  pipelineId: string,
  manifestCommitId: string,
  repository?: string
): Promise<RowManifest> => {
  const entries = await findMatchingDeployments<RowManifest>(
    tableInfo,
    "p3",
    pipelineId
  );
  // Ideally there should only be one entry for every pipeline id
  if (entries.length > 0) {
    const entry = entries[0];
    entry.manifestCommitId = manifestCommitId;
    if (repository) {
      entry.manifestRepo = repository.toLowerCase();
    }
    await updateEntryInTable(tableInfo, entry);
    logger.info(
      `Update manifest commit Id ${manifestCommitId} for pipeline Id ${pipelineId}`
    );
    return entry;
  }
  throw new Error(
    `No manifest generation found to update manifest commit ${manifestCommitId}`
  );
};

/**
 * Finds matching deployments for a filter name and filter value in the storage
 * @param tableInfo table info interface containing information about the deployment storage table
 * @param filterName name of the filter, such as `imageTag`
 * @param filterValue value of the filter, such as `hello-spk-master-1234`
 */
export const findMatchingDeployments = <T>(
  tableInfo: DeploymentTable,
  filterName: string,
  filterValue: string
): Promise<T[]> => {
  const tableService = getTableService(tableInfo);
  const query: azure.TableQuery = new azure.TableQuery().where(
    `PartitionKey eq '${tableInfo.partitionKey}'`
  );
  query.and(`${filterName} eq '${filterValue}'`);

  // To get around issue https://github.com/Azure/azure-storage-node/issues/545, set below to null
  const nextContinuationToken:
    | azure.TableService.TableContinuationToken
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | any = null;

  return new Promise((resolve, reject) => {
    tableService.queryEntities(
      tableInfo.tableName,
      query,
      nextContinuationToken,
      (error, result) => {
        if (!error) {
          resolve(result.entries as T[]);
        } else {
          reject(error);
        }
      }
    );
  });
};

/**
 * Inserts a new entry into the table.
 *
 * @param tableInfo Table Information
 * @param entry entry to insert
 */
export const insertToTable = (
  tableInfo: DeploymentTable,
  entry: RowSrcToACRPipeline | RowACRToHLDPipeline | RowHLDToManifestPipeline
): Promise<void> => {
  const tableService = getTableService(tableInfo);

  return new Promise((resolve, reject) => {
    tableService.insertEntity(tableInfo.tableName, entry, (err) => {
      if (!err) {
        resolve();
      } else {
        reject(err);
      }
    });
  });
};

/**
 * Deletes self test data from table
 * @param tableInfo table info object
 * @param entry entry to be deleted
 */
export const deleteFromTable = (
  tableInfo: DeploymentTable,
  entry: EntrySRCToACRPipeline
): Promise<void> => {
  const tableService = getTableService(tableInfo);

  return new Promise((resolve, reject) => {
    tableService.deleteEntity(tableInfo.tableName, entry, {}, (err) => {
      if (!err) {
        resolve();
      } else {
        reject(err);
      }
    });
  });
};

/**
 * Updates an entry in the table.
 *
 * @param tableInfo Table Information
 * @param entry entry to update
 */
export const updateEntryInTable = (
  tableInfo: DeploymentTable,
  entry:
    | RowSrcToACRPipeline
    | RowACRToHLDPipeline
    | RowHLDToManifestPipeline
    | RowManifest
): Promise<void> => {
  const tableService = getTableService(tableInfo);

  return new Promise((resolve, reject) => {
    tableService.replaceEntity(tableInfo.tableName, entry, (err) => {
      if (!err) {
        resolve();
      } else {
        reject(err);
      }
    });
  });
};

/**
 * Generates a RowKey GUID 12 characters long
 */
export const getRowKey = (): string => {
  return uuid().replace("-", "").substring(0, 12);
};
