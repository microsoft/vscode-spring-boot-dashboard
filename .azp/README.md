# Marketplace releases

The release pipelines follow the `vscode-java-pack` 1ES publishing pattern.
They publish an existing signed VSIX; they do not build, repackage, or re-sign it.
Both are **manual only** (`trigger: none`, `pr: none`, no schedules or build-completion triggers).
The existing nightly build schedule is unchanged and does not trigger publication.

## Azure DevOps setup

Create two Azure DevOps pipelines using **Existing Azure Pipelines YAML file**,
with `main` as the default branch:

| Release YAML in `.azp/` | Producer YAML in `.azp/` | Marketplace channel |
| --- | --- | --- |
| `VSCode-Spring-Boot-Dashboard-Release.yml` | `VSCode-Spring-Boot-Dashboard-RC.yml` | Stable |
| `VSCode-Spring-Boot-Dashboard-Release-Nightly.yml` | `VSCode-Spring-Boot-Dashboard-Nightly.yml` | Pre-release |

Configure these variables separately on each release pipeline:

| Variable | Value |
| --- | --- |
| `AzDo.ProjectId` | Azure DevOps project ID containing the producer pipeline. |
| `AzDo.BuildPipelineId` | The matching **producer pipeline definition ID** from the table above, not a release pipeline ID or an individual build/run ID. |

Do not point either release at the CI pipeline: it does not supply the required
signed release artifact. No organization-specific IDs or credentials are stored
in these YAML files.

Before enabling publication:

- Authorize access to `1ESPipelineTemplates/1ESPipelineTemplates` (`refs/tags/release`)
  and the Linux pool `1ES_JavaTooling_Pool`, image `1ES_JavaTooling_Ubuntu-2004`.
  The agent needs Node.js 20, PowerShell Core, Azure CLI, and network access to npm
  and the Visual Studio Marketplace.
- Grant the release pipeline's build identity permission to view the producer's
  builds and download its pipeline artifacts, including cross-project access if needed.
- Create or reuse the Azure Resource Manager service connection
  **`VSCode-Ext-Publishing`** and authorize these release pipelines to use it.
  Its Microsoft Entra identity must have publishing permission on the Marketplace
  publisher **`vscjava`**; Azure subscription access alone is not sufficient.
  Authentication uses `AzureCLI@2` and VSCE's `--azure-credential`, not a PAT in YAML.
- Configure the required production approvals/checks on protected resources,
  restrict who can queue releases or edit their variables, and leave UI trigger
  overrides, schedules, and build-completion triggers disabled. Both jobs are
  declared as production release jobs.

## Manual release

1. Identify the matching successful RC or nightly build. As in `vscode-java-pack`,
   the artifact input defaults to the **latest successful run** of the configured
   producer, not a pinned run ID. Before queuing, confirm that this is the intended
   source branch, commit, version, and channel; avoid queuing while a newer producer
   run could change that selection.
2. Inspect its `drop` pipeline artifact. It must contain these files at its root,
   all from the same signed build:
   - `extension.vsix`
   - `extension.manifest`
   - `extension.signature.p7s`
3. For nightly, the producer already packages with `--pre-release`. The release
   command also passes `--pre-release` to reject a VSIX not packaged as pre-release;
   it does not convert or modify the signed package. For stable, use the RC producer's
   stable VSIX. No proposed-API bypass is needed by this extension.
4. Manually run the corresponding **release** pipeline from `main` and complete
   the configured approvals. This action publishes to the Marketplace. Confirm the
   downloaded producer run in the release logs and the resulting version/channel
   on `vscjava.vscode-spring-boot-dashboard`. Do not rerun a published version.

Adding these files does not create Azure DevOps pipelines, configure permissions,
validate the private 1ES template on a hosted agent, or publish an extension.
Those environment-specific setup and approval steps remain with the release owners.
