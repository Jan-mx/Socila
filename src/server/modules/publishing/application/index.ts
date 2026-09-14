/** publishing 模块仓储访问器（进程级单例）。 */
import { DrizzlePublishReadRepository } from "../infrastructure/drizzle/publish-read.repository";
import { DrizzlePublishWriteRepository } from "../infrastructure/drizzle/publish-write.repository";

export const publishReads = new DrizzlePublishReadRepository();
export const publishWrites = new DrizzlePublishWriteRepository();
