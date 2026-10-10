export const version = "0.0.0";
export { validateConfig } from "./config.js";
export type { Fact, FactBinding, RequiredTag, RouteRule, SiteproofConfig, SitemapSetting, ValidationIssue, ValidationResult } from "./config.js";
export { collectUrls } from "./collect.js";
export type { CollectionIssue, CollectionOptions, CollectionResult } from "./collect.js";
export { extractPageMetadata, readPage } from "./page.js";
export type { PageMetadata, PageReadOptions } from "./page.js";
export { checkSeoMetadata } from "./checks.js";
export type { SeoCheckOptions, SeoFinding } from "./checks.js";
