import * as core from "@actions/core";
import * as github from "@actions/github";

interface SearchRespPRs {
  search: SearchResultPRs;
}

interface SearchResultPRs {
  nodes: Array<SearchResultNode>;
}

interface SearchResultNode {
  number: number;
  title: string;
  url: string;
  headRefName: string;
}

function getCurrentRepo(): string {
  if (!process.env.GITHUB_REPOSITORY) {
    throw "repo isn't set";
  }
  return process.env.GITHUB_REPOSITORY;
}

function formatDate(date: Date): string {
  return `${date.toISOString().slice(0, -5)}+00:00`;
}

function createSearchPRQuery(
  repo: string,
  author: string,
  createdBefore: Date,
  additionalFilter: string,
  ciStatus: string,
  prState: string
) {
  const created = formatDate(createdBefore);
  let query = `type:pr repo:${repo} author:${author} created:<=${created} state:${prState} status:${ciStatus}`;

  return (query + additionalFilter).trim();
}

// Stale failing renovate PR is
// 1. created by renovate bot
// 2. stay open for >= 7 day
// 3  CI status is failed
// Example: repo:wantedly/wantedly-frontend type:pr author:app/renovate state:open status:failure
function createStaleFailingRenovatePRQuery() {
  const author = "app/renovate";
  const repo = getCurrentRepo();
  const createdBefore = new Date();
  createdBefore.setDate(createdBefore.getDate() - 7);
  const additionalFilter = "";
  const ciStatus = "failure";
  const prState = "open";

  return createSearchPRQuery(
    repo,
    author,
    createdBefore,
    additionalFilter,
    ciStatus,
    prState
  );
}

export const run = async (): Promise<void> => {
  const ghToken = core.getInput("github_token");
  const octokit = github.getOctokit(ghToken);
  const repo = getCurrentRepo();
  const queryString = createStaleFailingRenovatePRQuery();
  core.info("Fetching pull requests");
  core.info("With query: " + queryString);

  const result: SearchRespPRs = await octokit.graphql(
    `
    query SearchStaleFailingRenovatePR($queryString: String!) {
      search(query: $queryString, type: ISSUE, last: 100) {
        issueCount
        nodes {
          ... on PullRequest {
            number
            title
            url
            headRefName
            author {
              login
            }
            commits(last: 100) {
              nodes {
                commit {
                  author {
                    user {
                      login
                    }
                  }
                }
              }
            }
            comments(last: 100) {
              nodes {
                author {
                  login
                }
              }
            }
          }
        }
      }
    }`,
    {
      queryString,
    }
  );

  core.info(`The number of pull requests: ${result.search.nodes.length}`);
  for (let i = 0; i < result.search.nodes.length; i++) {
    const node = result.search.nodes[i];
    core.info(
      `Close a pull request: title=${node.title} number=${node.number} url=${node.url}`
    );
    await octokit.rest.pulls.update({
      owner: repo.split("/")[0],
      repo: repo.split("/")[1],
      pull_number: node.number,
      state: "closed",
    });
    core.info(`Delete a ref: title=${node.title} ref=${node.headRefName}`);
    await octokit.rest.git
      .deleteRef({
        owner: repo.split("/")[0],
        repo: repo.split("/")[1],
        ref: `heads/${node.headRefName}`,
      })
      .catch((e) => {
        core.info(
          `Failed to delete a ref: title=${node.title} ref=${node.headRefName}: ${e}`
        );
      });
  }
};
