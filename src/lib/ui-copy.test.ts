import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixedInterfaceFiles = [
  "src/app/layout.tsx",
  "src/app/(client)/page.tsx",
  "src/app/(client)/cases/page.tsx",
  "src/components/layout/MarketingNav.tsx",
  "src/components/layout/MarketingFooter.tsx",
  "src/components/chat/ToolResultCard.tsx",
  "src/app/admin/AdminLayoutClient.tsx",
  "src/app/login/page.tsx",
  "src/app/register/page.tsx",
  "src/app/account/security/page.tsx",
  "src/app/admin/users/page.tsx",
  "src/app/admin/page.tsx",
];

describe("fixed interface copy", () => {
  it.each(fixedInterfaceFiles)("removes regional and SSP branding from %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");

    expect(source).not.toMatch(/上海|Shanghai|SSP/);
  });

  it("keeps compact Chinese navigation labels on one line", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/layout/MarketingNav.tsx"),
      "utf8",
    );

    expect(source).toMatch(/whitespace-nowrap/);
  });
});
