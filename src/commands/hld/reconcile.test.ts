import path from "path";
import { create as createBedrockYaml } from "../../lib/bedrockYaml";
import { disableVerboseLogging, enableVerboseLogging } from "../../logger";
import { BedrockFile, BedrockServiceConfig } from "../../types";
import * as reconcile from "./reconcile";
import {
  addChartToRing,
  checkForFabrikate,
  configureChartForRing,
  createAccessYaml,
  createRepositoryComponent,
  createRingComponent,
  createServiceComponent,
  createStaticComponent,
  execAndLog,
  execute,
  getFullPathPrefix,
  normalizedName,
  ReconcileDependencies,
  reconcileHld,
  testAndGetAbsPath,
  validateInputs,
} from "./reconcile";

beforeAll(() => {
  enableVerboseLogging();
});

afterAll(() => {
  disableVerboseLogging();
});

describe("test execute function", () => {
  it("negative test", async () => {
    const exitFn = jest.fn();
    await execute("10", "hld-path", "app-path", exitFn);
    expect(exitFn).toBeCalledTimes(1);
    expect(exitFn.mock.calls).toEqual([[1]]);
  });
  it("positive test", async () => {
    const exitFn = jest.fn();
    const dir = createBedrockYaml();
    jest.spyOn(reconcile, "checkForFabrikate").mockReturnValueOnce();
    jest.spyOn(reconcile, "testAndGetAbsPath").mockReturnValueOnce(dir);
    jest.spyOn(reconcile, "testAndGetAbsPath").mockReturnValueOnce(dir);
    jest
      .spyOn(reconcile, "reconcileHld")
      .mockReturnValueOnce(Promise.resolve());

    await execute("repo-name", "hld-path", "app-path", exitFn);
    expect(exitFn).toBeCalledTimes(1);
    expect(exitFn.mock.calls).toEqual([[0]]);
  });
});

describe("validateInputs", () => {
  it("should not accept an invalid input for repository-name", () => {
    expect(() => {
      validateInputs("", "hld-path", "app-path");
    }).toThrow();
  });

  it("should not accept an invalid input for hld-path", () => {
    expect(() => {
      validateInputs("repo-name", "", "app-path");
    }).toThrow();
  });

  it("should not accept an invalid input for bedrock-application-repo-path", () => {
    expect(() => {
      validateInputs("repo-name", "repo-name", "");
    }).toThrow();
  });

  it("should accept valid inputs for validateInputs", () => {
    expect(() => {
      validateInputs("repo-name", "repo-name", "bedrock-application-repo-path");
    }).not.toThrow();
  });
});

describe("checkForFabrikate", () => {
  it("throws an error if fabrikate is not installed", () => {
    const which = jest.fn();
    which.mockReturnValue("");

    expect(() => {
      checkForFabrikate(which);
    }).toThrow();
  });

  it("does not throw an error if fabrikate is installed", () => {
    const which = jest.fn();
    which.mockReturnValue("/some/path/to/fabrikate");

    expect(() => {
      checkForFabrikate(which);
    }).not.toThrow();
  });
});

describe("testAndGetAbsPath", () => {
  it("fails to test and get an absolute path for a file", () => {
    const test = jest.fn();
    const log = jest.fn();

    expect(() => {
      // Could not find the path.
      test.mockReturnValue(false);

      testAndGetAbsPath(test, log, "/some/path/to/hld-path", "hld-path");
    }).toThrow();
  });

  it("finds an absolute path for a file", () => {
    const test = jest.fn();
    const log = jest.fn();

    expect(() => {
      // Could not find the path.
      test.mockReturnValue(true);

      testAndGetAbsPath(test, log, "/some/path/to/hld-path", "hld-path");
    }).not.toThrow();
  });
});

describe("createServiceComponent", () => {
  let exec = jest.fn().mockReturnValue(Promise.resolve({}));
  const repoInHldPath = "myMonoRepo";
  const pathBase = "myService";

  const expectedInvocation = `cd ${repoInHldPath} && mkdir -p ${pathBase} config && fab add ${pathBase} --path ./${pathBase} --method local --type component && touch ./config/common.yaml`;

  it("should invoke the correct command for adding service to hld", async () => {
    await createServiceComponent(exec, repoInHldPath, pathBase);
    expect(exec).toBeCalled();
    expect(exec).toBeCalledWith(expectedInvocation);
  });

  it("should throw an error if exec fails", async () => {
    exec = jest
      .fn()
      .mockImplementation(async () => Promise.reject(new Error()));

    await expect(
      createServiceComponent(exec, repoInHldPath, pathBase)
    ).rejects.toThrow();
  });
});

describe("createAccessYaml", () => {
  it("should invoke the correct command for writing access yaml", async () => {
    const gitUrl = "https://dev.azure.com/foo/bar";
    const absBedrockPath = "/abs/bedrock/path";
    const absRepoPathInHld = "/abs/hld/repo/";
    const getGitOrigin = jest.fn().mockReturnValue(Promise.resolve(gitUrl));
    const writeAccessYaml = jest.fn();

    await createAccessYaml(
      getGitOrigin,
      writeAccessYaml,
      absBedrockPath,
      absRepoPathInHld
    );

    expect(getGitOrigin).toBeCalledWith(absBedrockPath);
    expect(writeAccessYaml).toBeCalledWith(absRepoPathInHld, gitUrl);
  });
});

describe("createRepositoryComponent", () => {
  let exec = jest.fn().mockReturnValue(Promise.resolve({}));
  const hldPath = `myMonoRepo`;
  const repositoryName = `myRepo`;

  const expectedInvocation = `cd ${hldPath} && mkdir -p ${repositoryName} && fab add ${repositoryName} --path ./${repositoryName} --method local`;

  it("should invoke the correct command for adding repository to hld", async () => {
    await createRepositoryComponent(exec, hldPath, repositoryName);

    expect(exec).toBeCalled();
    expect(exec).toBeCalledWith(expectedInvocation);
  });

  it("should throw an error if exec fails", async () => {
    exec = jest
      .fn()
      .mockImplementation(async () => Promise.reject(new Error()));

    await expect(
      createRepositoryComponent(exec, hldPath, repositoryName)
    ).rejects.toThrow();
  });
});

describe("createRingComponent", () => {
  let exec = jest.fn().mockReturnValue(Promise.resolve({}));
  const svcPathInHld = `/path/to/service`;
  const ring = `dev`;
  const expectedInvocation = `cd ${svcPathInHld} && mkdir -p ${ring} config && fab add ${ring} --path ./${ring} --method local --type component && touch ./config/common.yaml`;

  it("should invoke the correct command for adding rings to hld", async () => {
    await createRingComponent(exec, svcPathInHld, ring);

    expect(exec).toBeCalled();
    expect(exec).toBeCalledWith(expectedInvocation);
  });

  it("should throw an error if exec fails", async () => {
    exec = jest
      .fn()
      .mockImplementation(async () => Promise.reject(new Error()));

    await expect(
      createRingComponent(exec, svcPathInHld, ring)
    ).rejects.toThrow();
  });
});

describe("createStaticComponent", () => {
  let exec = jest.fn().mockReturnValue(Promise.resolve({}));
  const ringPathInHld = `/ring/path/in/hld`;
  const expectedInvocation = `cd ${ringPathInHld} && mkdir -p config static && fab add static --path ./static --method local --type static && touch ./config/common.yaml`;

  it("should invoke the correct command for creating static components", async () => {
    await createStaticComponent(exec, ringPathInHld);

    expect(exec).toBeCalled();
    expect(exec).toBeCalledWith(expectedInvocation);
  });

  it("should throw an error if exec fails", async () => {
    exec = jest
      .fn()
      .mockImplementation(async () => Promise.reject(new Error()));

    await expect(createStaticComponent(exec, ringPathInHld)).rejects.toThrow();
  });
});

describe("addChartToRing", () => {
  let exec = jest.fn().mockReturnValue(Promise.resolve({}));

  it("should invoke the correct command for adding a helm chart with a branch version", async () => {
    const ringPath = "/path/to/ring";

    const branch = "v1";
    const git = "github.com/company/service";
    const chartPath = "/charts/service";

    const serviceConfig: BedrockServiceConfig = {
      helm: {
        chart: {
          branch,
          git,
          path: chartPath,
        },
      },
      k8sBackendPort: 1337,
    };

    const addHelmChartCommand = `fab add chart --source ${git} --path ${chartPath} --branch ${branch} --type helm`;

    const expectedInvocation = `cd ${ringPath} && ${addHelmChartCommand}`;

    await addChartToRing(exec, ringPath, serviceConfig);

    expect(exec).toBeCalled();
    expect(exec).toBeCalledWith(expectedInvocation);
  });

  it("should invoke the correct command for adding a helm chart with a git-sha", async () => {
    const ringPath = "/path/to/ring";

    const sha = "f8a33e1d";
    const git = "github.com/company/service";
    const chartPath = "/charts/service";

    const serviceConfig: BedrockServiceConfig = {
      helm: {
        chart: {
          git,
          path: chartPath,
          sha,
        },
      },
      k8sBackendPort: 1337,
    };

    const addHelmChartCommand = `fab add chart --source ${git} --path ${chartPath} --version ${sha} --type helm`;

    const expectedInvocation = `cd ${ringPath} && ${addHelmChartCommand}`;

    await addChartToRing(exec, ringPath, serviceConfig);

    expect(exec).toBeCalled();
    expect(exec).toBeCalledWith(expectedInvocation);
  });

  it("should invoke the correct command for adding a helm chart with a helm repository", async () => {
    const ringPath = "/path/to/ring";

    const repository = "github.com/company/service";
    const chart = "/charts/service";

    const serviceConfig: BedrockServiceConfig = {
      helm: {
        chart: {
          chart,
          repository,
        },
      },
      k8sBackendPort: 1337,
    };

    const addHelmChartCommand = `fab add chart --source ${repository} --path ${chart} --type helm`;
    const expectedInvocation = `cd ${ringPath} && ${addHelmChartCommand}`;

    await addChartToRing(exec, ringPath, serviceConfig);

    expect(exec).toBeCalled();
    expect(exec).toBeCalledWith(expectedInvocation);
  });

  it("should should throw an error if exec fails", async () => {
    exec = jest
      .fn()
      .mockImplementation(async () => Promise.reject(new Error()));

    const ringPath = "/path/to/ring";
    const repository = "github.com/company/service";
    const chart = "/charts/service";

    const serviceConfig: BedrockServiceConfig = {
      helm: {
        chart: {
          chart,
          repository,
        },
      },
      k8sBackendPort: 1337,
    };

    await expect(
      addChartToRing(exec, ringPath, serviceConfig)
    ).rejects.toThrow();
  });
});

describe("configureChartForRing", () => {
  let exec = jest.fn().mockReturnValue(Promise.resolve({}));
  const ringPath = "/path/to/ring";
  const ringName = "myringname";
  const normalizedServiceName = "my-great-service";
  const serviceConfig: BedrockServiceConfig = {
    helm: {
      chart: {
        git: "foo",
        path: "bar",
        sha: "baz",
      },
    },
    k8sBackend: "k8s-svc",
    k8sBackendPort: 80,
  };

  it("should invoke the correct command for configuring a chart for a ring with the k8s service being configured from the config", async () => {
    await configureChartForRing(
      exec,
      ringPath,
      ringName,
      serviceConfig,
      normalizedServiceName
    );

    const k8sSvcBackendAndName = [serviceConfig.k8sBackend, ringName].join("-");
    const expectedInvocation = `cd ${ringPath} && fab set --subcomponent "chart" serviceName="${k8sSvcBackendAndName}"`;

    expect(exec).toBeCalled();
    expect(exec).toBeCalledWith(expectedInvocation);
  });

  it("should invoke the correct command and calculate the k8s service name from the bedrock service name if there is no k8sbackend configured.", async () => {
    const serviceConfigNoK8sBackend: BedrockServiceConfig = {
      helm: {
        chart: {
          git: "foo",
          path: "bar",
          sha: "baz",
        },
      },
      k8sBackend: "",
      k8sBackendPort: 80,
    };

    const k8sSvcBackendAndName = [normalizedServiceName, ringName].join("-");
    const expectedInvocation = `cd ${ringPath} && fab set --subcomponent "chart" serviceName="${k8sSvcBackendAndName}"`;
    await configureChartForRing(
      exec,
      ringPath,
      ringName,
      serviceConfigNoK8sBackend,
      normalizedServiceName
    );

    expect(exec).toBeCalled();
    expect(exec).toBeCalledWith(expectedInvocation);
  });

  it("should throw an error if exec fails", async () => {
    exec = jest
      .fn()
      .mockImplementation(async () => Promise.reject(new Error()));

    await expect(
      configureChartForRing(
        exec,
        ringPath,
        ringName,
        serviceConfig,
        normalizedServiceName
      )
    ).rejects.toThrow();
  });
});

describe("reconcile tests", () => {
  let dependencies: ReconcileDependencies;
  let bedrockYaml: BedrockFile;
  const sha = "f8a33e1d";
  const git = "github.com/company/service";
  const pathToChart = "/charts/service";
  const accessTokenVariable = "SECRET_TOKEN";
  beforeEach(() => {
    dependencies = {
      addChartToRing: jest.fn().mockReturnValue(Promise.resolve({})),
      configureChartForRing: jest.fn().mockReturnValue(Promise.resolve({})),
      createAccessYaml: jest.fn(),
      createIngressRouteForRing: jest.fn().mockReturnValue(Promise.resolve({})),
      createMiddlewareForRing: jest.fn().mockReturnValue(Promise.resolve({})),
      createRepositoryComponent: jest.fn().mockReturnValue(Promise.resolve({})),
      createRingComponent: jest.fn().mockReturnValue(Promise.resolve({})),
      createServiceComponent: jest.fn().mockReturnValue(Promise.resolve({})),
      createStaticComponent: jest.fn().mockReturnValue(Promise.resolve({})),
      exec: jest.fn().mockReturnValue(Promise.resolve({})),
      generateAccessYaml: jest.fn(),
      getGitOrigin: jest.fn(),
      writeFile: jest.fn(),
    };

    bedrockYaml = {
      rings: {
        dev: {
          isDefault: true,
        },
        prod: {},
      },
      services: {
        "./path/to/a/svc/": {
          disableRouteScaffold: false,
          helm: {
            chart: {
              accessTokenVariable,
              git,
              path: pathToChart,
              sha,
            },
          },
          k8sBackend: "cool-service",
          k8sBackendPort: 1337,
        },
      },
      version: "1.0",
    };
  });

  it("executes the appropriate functions for creating or updating a HLD", async () => {
    await reconcileHld(
      dependencies,
      bedrockYaml,
      "service",
      "./path/to/hld",
      "./path/to/app"
    );

    expect(dependencies.createRepositoryComponent).toHaveBeenCalled();
    expect(dependencies.createAccessYaml).toHaveBeenCalled();
    expect(dependencies.createServiceComponent).toHaveBeenCalledTimes(1);
    expect(dependencies.createRingComponent).toHaveBeenCalledTimes(2);
    expect(dependencies.configureChartForRing).toHaveBeenCalledTimes(2);
    expect(dependencies.addChartToRing).toHaveBeenCalledTimes(2);
    expect(dependencies.createStaticComponent).toHaveBeenCalledTimes(2);
    expect(dependencies.createMiddlewareForRing).toHaveBeenCalledTimes(2);
    expect(dependencies.createIngressRouteForRing).toHaveBeenCalledTimes(2);
    expect(dependencies.generateAccessYaml).toHaveBeenCalledTimes(1);
    expect(dependencies.generateAccessYaml).toBeCalledWith(
      "path/to/hld/service",
      git,
      accessTokenVariable
    );
  });

  it("should be able to create a HLD without rings, when no rings are provided", async () => {
    // bedrock yaml fixture
    bedrockYaml.rings = {};

    await reconcileHld(
      dependencies,
      bedrockYaml,
      "service",
      "./path/to/hld",
      "./path/to/app"
    );

    expect(dependencies.createRepositoryComponent).toHaveBeenCalled();
    expect(dependencies.createServiceComponent).toHaveBeenCalledTimes(1);
    expect(dependencies.createRingComponent).not.toHaveBeenCalled();
  });

  it("does not produce ingress routes or middlewares when route scaffold is disabled", async () => {
    // bedrock yaml fixture
    bedrockYaml = {
      rings: {
        dev: {
          isDefault: true,
        },
      },
      services: {
        "./path/to/svc/": {
          disableRouteScaffold: true,
          helm: {
            chart: {
              git,
              path: pathToChart,
              sha,
            },
          },
          k8sBackendPort: 1337,
        },
      },
      version: "1.0",
    };

    await reconcileHld(
      dependencies,
      bedrockYaml,
      "service",
      "./path/to/hld",
      "./path/to/app"
    );

    expect(dependencies.createRepositoryComponent).toHaveBeenCalled();
    expect(dependencies.createAccessYaml).toHaveBeenCalled();
    expect(dependencies.createServiceComponent).toHaveBeenCalledTimes(1);
    expect(dependencies.createRingComponent).toHaveBeenCalledTimes(1);
    expect(dependencies.addChartToRing).toHaveBeenCalledTimes(1);

    // Skipping route generation.
    expect(dependencies.createStaticComponent).toHaveBeenCalledTimes(0);
    expect(dependencies.createMiddlewareForRing).not.toHaveBeenCalled();
    expect(dependencies.createIngressRouteForRing).not.toHaveBeenCalled();
  });

  it("overwrites existing rings", async () => {
    bedrockYaml.rings = {
      dev: {
        isDefault: true,
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const i of Array(2)) {
      await reconcileHld(
        dependencies,
        bedrockYaml,
        "service",
        "./path/to/hld",
        "./path/to/app"
      );
    }

    // Reconcile should run twice against the existing service's rings.
    expect(dependencies.createRingComponent).toHaveBeenCalledTimes(2);
    expect(dependencies.addChartToRing).toHaveBeenCalledTimes(2);
    expect(dependencies.createStaticComponent).toHaveBeenCalledTimes(2);
    expect(dependencies.createMiddlewareForRing).toHaveBeenCalledTimes(2);
    expect(dependencies.createIngressRouteForRing).toHaveBeenCalledTimes(2);
  });

  it("does not create rings, if they don't exist within bedrock.yaml", async () => {
    bedrockYaml.rings = {};

    await reconcileHld(
      dependencies,
      bedrockYaml,
      "service",
      "./path/to/hld",
      "./path/to/app"
    );

    expect(dependencies.createRingComponent).not.toHaveBeenCalled();
    expect(dependencies.createStaticComponent).not.toHaveBeenCalled();
    expect(dependencies.createMiddlewareForRing).not.toHaveBeenCalled();
    expect(dependencies.createIngressRouteForRing).not.toHaveBeenCalled();
  });

  it("does not create service components if the service path is `.`, and a display name does not exist", async () => {
    bedrockYaml.services = {
      ".": {
        disableRouteScaffold: false,
        helm: {
          chart: {
            git,
            path: pathToChart,
            sha,
          },
        },
        k8sBackendPort: 80,
      },
    };

    await reconcileHld(
      dependencies,
      bedrockYaml,
      "service",
      "./path/to/hld",
      "./path/to/app"
    );

    expect(dependencies.createServiceComponent).not.toHaveBeenCalled();
  });

  it("does create service components if the service path is `.` and a display name does exist", async () => {
    const displayName = "fabrikam";

    bedrockYaml.services = {
      ".": {
        disableRouteScaffold: false,
        displayName,
        helm: {
          chart: {
            git,
            path: pathToChart,
            sha,
          },
        },
        k8sBackendPort: 80,
      },
    };

    await reconcileHld(
      dependencies,
      bedrockYaml,
      "service",
      "./path/to/hld",
      "./path/to/app"
    );
    expect(dependencies.createServiceComponent).toHaveBeenCalled();

    // Second argument of first invocation of createServiceComponent is the service name
    expect(
      (dependencies.createServiceComponent as jest.Mock).mock.calls[0][2]
    ).toBe(displayName);
  });

  it("uses display name over the service path for creating service components", async () => {
    const displayName = "fabrikam";

    bedrockYaml.services = {
      "/my/service/path": {
        disableRouteScaffold: false,
        displayName,
        helm: {
          chart: {
            git,
            path: pathToChart,
            sha,
          },
        },
        k8sBackendPort: 80,
      },
    };

    await reconcileHld(
      dependencies,
      bedrockYaml,
      "service",
      "./path/to/hld",
      "./path/to/app"
    );
    expect(dependencies.createServiceComponent).toHaveBeenCalled();

    // Second argument of first invocation of createServiceComponent is the service name
    expect(
      (dependencies.createServiceComponent as jest.Mock).mock.calls[0][2]
    ).toBe(displayName);
  });

  it("properly updates access.yaml", async () => {
    const anotherGit = "github.com/foobar/baz";
    const anotherToken = "MY_FANCY_ENV_VAR";
    bedrockYaml.services["another/service"] = {
      disableRouteScaffold: false,
      helm: {
        chart: {
          accessTokenVariable: anotherToken,
          git: anotherGit,
          path: "path/to/chart",
          sha: "12345",
        },
      },
      k8sBackendPort: 8888,
    };
    const pathToHLD = "./the/path/to/hld";
    const service = "service";
    await reconcileHld(
      dependencies,
      bedrockYaml,
      service,
      pathToHLD,
      "./path/to/app"
    );
    expect(dependencies.generateAccessYaml).toHaveBeenCalledTimes(2);
    expect(dependencies.generateAccessYaml).toHaveBeenCalledWith(
      path.join(pathToHLD, service),
      git,
      accessTokenVariable
    );
    expect(dependencies.generateAccessYaml).toHaveBeenCalledWith(
      path.join(pathToHLD, service),
      anotherGit,
      anotherToken
    );
  });
});

describe("normalizedName", () => {
  it("lower cases a name", () => {
    expect(normalizedName("Fabrikam")).toBe("fabrikam");
  });

  it("removes slashes from a name", () => {
    expect(normalizedName("fabrikam/frontend")).toBe("fabrikam-frontend");
  });

  it("removes periods from a name", () => {
    expect(normalizedName("fabrikam.frontend")).toBe("fabrikam-frontend");
  });

  it("can handle multiple occurences of invalid characters", () => {
    expect(normalizedName("fabrikam.frontend.foo")).toBe(
      "fabrikam-frontend-foo"
    );
    expect(normalizedName("fabrikam/frontend/foo")).toBe(
      "fabrikam-frontend-foo"
    );
  });

  it("can handle combinations of slashes and periods and caps in a name", () => {
    expect(normalizedName("Fabrikam.frontend/CartService")).toBe(
      "fabrikam-frontend-cartservice"
    );
  });

  it("replaces non-(alphanumeric|dash) with dashes", () => {
    expect(normalizedName("foo-!@#.#$%")).toBe("foo--------");
  });
});

describe("execAndLog", () => {
  test("working command", async () => {
    let error: Error | undefined;
    try {
      const result = await execAndLog("ls");
      expect((result.value?.stderr ?? "").length).toBe(0);
      expect((result.value?.stdout ?? "").length > 0).toBe(true);
      expect(result.error).toBeUndefined();
    } catch (err) {
      error = err;
    }
    expect(error).toBeUndefined();
  });

  test("broken command", async () => {
    let error: Error | undefined;
    try {
      const result = await execAndLog("some-executable-that-does-not-exist");
      expect(result.error).toBeDefined();
      expect((result.value?.stderr ?? "").length > 0).toBe(true);
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
  });
});

describe("getFullPathPrefix", () => {
  it("should create a full path with just serviceName", () => {
    const majorVersion = "";
    const pathPrefix = "";
    const serviceName = "my-service";

    const fullPath = getFullPathPrefix(majorVersion, pathPrefix, serviceName);
    expect(fullPath).toBe(`/${serviceName}`);
  });

  it("with serviceName and pathPrefix it should only have pathPrefix", () => {
    const majorVersion = "";
    const pathPrefix = "service/path";
    const serviceName = "my-service";

    const fullPath = getFullPathPrefix(majorVersion, pathPrefix, serviceName);
    expect(fullPath).toBe(`/${pathPrefix}`);
  });

  it("with serviceName and version it should only have version and service name", () => {
    const majorVersion = "v2";
    const pathPrefix = "";
    const serviceName = "my-service";

    const fullPath = getFullPathPrefix(majorVersion, pathPrefix, serviceName);
    expect(fullPath).toBe(`/${majorVersion}/${serviceName}`);
  });

  it("with pathPrefix and version it should only have version and the pathprefix", () => {
    const majorVersion = "v2";
    const pathPrefix = "service/path";
    const serviceName = "my-service";

    const fullPath = getFullPathPrefix(majorVersion, pathPrefix, serviceName);
    expect(fullPath).toBe(`/${majorVersion}/${pathPrefix}`);
  });
});
