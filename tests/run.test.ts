import {
  createSearchPRQuery,
  createStaleFailingRenovatePRQuery,
  formatDate,
  isCommentedByHuman,
  isCommittedByHuman,
} from "../src/run"; // Assuming the 'formatDate' function is exported from the 'app' module
import { expect, describe, it } from "vitest";

describe("formatDate", () => {
  it("returns the correctly formatted date string", () => {
    const date = new Date("2021-09-01T12:30:45.000Z");
    const formattedDate = formatDate(date);
    expect(formattedDate).toBe("2021-09-01T12:30:45+00:00");
  });

  it("handles various date inputs correctly", () => {
    const date1 = new Date("2020-01-01T00:00:00.000Z");
    const formattedDate1 = formatDate(date1);
    expect(formattedDate1).toBe("2020-01-01T00:00:00+00:00");

    const date2 = new Date("2022-12-31T23:59:59.000Z");
    const formattedDate2 = formatDate(date2);
    expect(formattedDate2).toBe("2022-12-31T23:59:59+00:00");
  });
});

// Test cases for isCommentedByHuman
describe("isCommentedByHuman", () => {
  it("returns true when there are comments by a human user", () => {
    const comments = [
      { author: { login: "humanUser" } },
      { author: { login: "renovate[bot]" } },
    ];

    expect(isCommentedByHuman(comments)).toBe(true);
  });

  it("returns false when there are no comments by a human user", () => {
    const comments = [
      { author: { login: "renovate[bot]" } },
      { author: { login: "github-actions" } },
    ];

    expect(isCommentedByHuman(comments)).toBe(false);
  });
});

// Test cases for isCommittedByHuman
describe("isCommittedByHuman", () => {
  it("returns true when there are commits by a human user", () => {
    const commits = [
      { commit: { author: { user: { login: "humanUser" } } } },
      { commit: { author: { user: { login: "renovate[bot]" } } } },
    ];

    expect(isCommittedByHuman(commits)).toBe(true);
  });

  it("returns false when there are no commits by a human user", () => {
    const commits = [
      { commit: { author: { user: { login: "renovate[bot]" } } } },
      { commit: { author: { user: { login: "github-actions" } } } },
    ];

    expect(isCommittedByHuman(commits)).toBe(false);
  });
});

describe("createSearchPRQuery", () => {
  it("returns the correct search query string", () => {
    const repo = "example/repo";
    const author = "example-author";
    const createdBefore = new Date("2021-09-01T12:30:45.000Z");
    const additionalFilter = "extra:filter";
    const ciStatus = "success";
    const prState = "open";

    const query = createSearchPRQuery(
      repo,
      author,
      createdBefore,
      additionalFilter,
      ciStatus,
      prState
    );
    const expectedQuery =
      "type:pr repo:example/repo author:example-author created:<=2021-09-01T12:30:45+00:00 state:open status:success extra:filter";

    expect(query).toBe(expectedQuery);
  });
});

describe("createStaleFailingRenovatePRQuery", () => {
  // This test assumes the getCurrentRepo function has been exported and mocked
  it("returns the correct query string for stale failing Renovate PRs", () => {
    const repo = "test/test"; // Replace with your repo
    const query = createStaleFailingRenovatePRQuery(repo);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const createdBefore = sevenDaysAgo.toISOString().slice(0, -5) + "+00:00";

    const expectedQuery = `type:pr repo:${repo} author:app/renovate created:<=${createdBefore} state:open status:failure`;

    expect(query).toBe(expectedQuery);
  });
});
