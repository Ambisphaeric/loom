export {
	JoinSynchronizer,
	JoinError,
	createWaitAllJoin,
	createWaitAnyJoin,
	createBarrierJoin,
	createTimeoutJoin,
	createFirstWinsJoin,
} from "./join-synchronizer.js";
export type { JoinStrategy, JoinConfig, BranchState } from "./join-synchronizer.js";
