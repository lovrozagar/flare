// One verify:safari at a time on the Mac: safaridriver drives one Safari, and two runs that share it break each
// other's flows. The lock is a directory made with `mkdir`, atomic on the Mac's filesystem, holding `owner` with the
// holder's `<host>:<pid>` and its start time in epoch ms. A lock older than a run's limit is stale: its run died
// without its `finally`, so it is taken over.

// The shell side, run on the Mac with the lock path, this run's owner, its start, and the stale age as $1 to $4.
// Exit 0: acquired. Exit 3: held, and the holder's owner line is printed.
export const ACQUIRE = `lock=$1; owner=$2; now=$3; stale=$4
take() { mkdir "$lock" 2>/dev/null && printf '%s %s\\n' "$owner" "$now" > "$lock/owner"; }
take && exit 0
read -r held since < "$lock/owner" 2>/dev/null || { held=unknown; since=$now; }
if [ $((now - since)) -gt "$stale" ]; then rm -rf "$lock"; take && exit 0; fi
printf '%s %s\\n' "$held" "$since"
exit 3`;

// Removes the lock only while this run owns it, so a run that lost a stale lock never frees another's.
export const RELEASE = `lock=$1; owner=$2
read -r held _since < "$lock/owner" 2>/dev/null && [ "$held" = "$owner" ] && rm -rf "$lock"
exit 0`;

// Runs one of the scripts above on the Mac with its arguments; the exit status and stdout.
export type Remote = (script: string, args: readonly string[]) => { status: number | null; stdout: string };

export type Lock = { path: string; owner: string; staleMs: number };

export function acquire(remote: Remote, lock: Lock, now: number): void {
	const answer = remote(ACQUIRE, [lock.path, lock.owner, String(now), String(lock.staleMs)]);
	if (answer.status === 0) return;
	if (answer.status !== 3) throw new Error(`The Safari lock on the Mac did not answer (exit ${answer.status})`);
	const [holder = "unknown", since = "0"] = answer.stdout.trim().split(" ");
	throw new Error(`Safari is in use by ${holder}, since ${new Date(Number(since)).toISOString()}`);
}

export function release(remote: Remote, lock: Lock): void {
	remote(RELEASE, [lock.path, lock.owner]);
}

// Single-quoted for the remote shell.
export function quote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}
