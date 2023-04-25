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
  author: {
    login: string;
  };
  commits: {
    nodes: Array<CommitNode>;
  };
  comments: {
    nodes: Array<CommentNode>;
  };
}

interface CommitNode {
  commit: {
    author: {
      user: {
        login: string;
      };
    };
  };
}

interface CommentNode {
  author: {
    login: string;
  };
}

function getCurrentRepo(): string {
  if (!process.env.GITHUB_REPOSITORY) {
    throw "repo isn't set";
  }
  return process.env.GITHUB_REPOSITORY;
}

export function formatDate(date: Date): string {
  return `${date.toISOString().slice(0, -5)}+00:00`;
}

export function createSearchPRQuery(
  repo: string,
  author: string,
  createdBefore: Date,
  additionalFilter: string,
  ciStatus: string,
  prState: string
) {
  const created = formatDate(createdBefore);
  let query = `type:pr repo:${repo} author:${author} created:<=${created} state:${prState} status:${ciStatus}`;

  return `${query} ${additionalFilter}`.trim();
}

// Stale failing renovate PR is
// 1. created by renovate bot
// 2. stay open for >= 7 day
// 3  CI status is failed
// Example: repo:wantedly/wantedly-frontend type:pr author:app/renovate state:open status:failure
export function createStaleFailingRenovatePRQuery(repo: string) {
  const author = "app/renovate";
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

const BOT_LOGINS = ["renovate[bot]", "github-actions", "jjenko"];

export const isCommentedByHuman = (comments: Array<CommentNode>): boolean => {
  return comments.some((comment) => {
    return !BOT_LOGINS.includes(comment.author.login);
  });
};

export const isCommittedByHuman = (commits: Array<CommitNode>): boolean => {
  return commits.some((commit) => {
    return !BOT_LOGINS.includes(commit.commit.author.user.login);
  });
};

async function closePullRequest(
  octokit: ReturnType<typeof github.getOctokit>,
  repo: string,
  pullNumber: number
): Promise<void> {
  await octokit.rest.pulls.update({
    owner: repo.split("/")[0],
    repo: repo.split("/")[1],
    pull_number: pullNumber,
    state: "closed",
  });
}

async function deleteRef(
  octokit: ReturnType<typeof github.getOctokit>,
  repo: string,
  refName: string
): Promise<void> {
  await octokit.rest.git
    .deleteRef({
      owner: repo.split("/")[0],
      repo: repo.split("/")[1],
      ref: `heads/${refName}`,
    })
    .catch((e) => {
      core.info(`Failed to delete ref: ref=${refName}: ${e}`);
    });
}

async function fetchStaleFailingRenovatePRs(
  octokit: ReturnType<typeof github.getOctokit>,
  queryString: string
): Promise<Array<SearchResultNode>> {
  const result: SearchRespPRs = await octokit.graphql(
    `
    query SearchStaleFailingRenovatePR($queryString: String!) {
      search(query: $queryString, type: ISSUE, last: 100) {
        nodes {
          ... on PullRequest {
            number
            title
            url
            headRefName
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

  return result.search.nodes;
}

export const run = async (): Promise<void> => {
  const ghToken = core.getInput("github_token");
  const octokit = github.getOctokit(ghToken);
  const repo = getCurrentRepo();
  const queryString = createStaleFailingRenovatePRQuery(repo);
  core.info("Fetching pull requests");

  const prNodes = await fetchStaleFailingRenovatePRs(octokit, queryString);

  const stalePRs = prNodes.filter((node) => {
    return (
      !isCommentedByHuman(node.comments.nodes) &&
      !isCommittedByHuman(node.commits.nodes)
    );
  });

  core.info(`The number of pull requests: ${stalePRs.length}`);
  for (const pr of stalePRs) {
    core.info(
      `Closing pull request: title=${pr.title} number=${pr.number} url=${pr.url}`
    );
    await closePullRequest(octokit, repo, pr.number);

    core.info(`Deleting ref: title=${pr.title} ref=${pr.headRefName}`);
    await deleteRef(octokit, repo, pr.headRefName);
  }
};
