/*
Benchmark for Actor runtime

This benchmark was mainly created for testing Actor run time performance to compare previous and distroless build.
*/
import { ActorRun, ApifyClient } from 'apify-client';

// Configuration constants
const API_TOKEN = process.env.APIFY_TOKEN;
//const ACTOR_NAME = 'apify/rag-web-browser';
const ACTOR_NAME = 'jakub.kopecky/rag-web-browser';
const MAX_RUNS = 500;
const MAX_MEMORY_GB = 64; // Total memory available
const ACTOR_MEMORY_GB = 1; // Memory per actor run
const ACTOR_INPUT = {
    query: 'apify ai',
    maxResults: 1,
};

// Initialize Apify client
const client = new ApifyClient({ token: API_TOKEN });

async function computeLogTimes(run: ActorRun): Promise<{
    pullToStartTime: number;
    startToSystemTime: number;
}> {
    const log = await client.run(run.id).log().get();
    if (!log) {
        throw new Error(`Failed to get logs for run ${run.id}`);
    }

    const lines = log.split('\n');
    // get initial
    const startTimeStr = lines[0].split(' ')[0];
    const startTime = new Date(startTimeStr).getTime();

    // starting container
    const startContainerLine = lines.find(line => line.includes('Starting Docker container'));
    if (!startContainerLine) {
        throw new Error(`Failed to find start container line in logs for run ${run.id}`);
    }
    const startContainerTimeStr = startContainerLine?.split(' ')[0];
    const startContainerTime = new Date(startContainerTimeStr).getTime();

    // system info
    const systemInfoLine = lines.find(line => line.includes('System info'));
    if (!systemInfoLine) {
        throw new Error(`Failed to find system info line in logs for run ${run.id}`);
    }
    const systemInfoTimeStr = systemInfoLine?.split(' ')[0];
    const systemInfoTime = new Date(systemInfoTimeStr).getTime();

    // Calculate times
    const pullToStartTime = (startContainerTime - startTime) / 1000; // in seconds
    const startToSystemTime = (systemInfoTime - startContainerTime) / 1000; // in seconds

    return {
        pullToStartTime,
        startToSystemTime,
    };
}

async function waitForRunFinishAndHandle(concurrentRunIDs: string[]): Promise<{
    pullToStartTime: number;
    startToSystemTime: number;
    run: ActorRun;
}> {
    //const run = await client.run(concurrentRunIDs[0]).waitForFinish();
    let runid: string | undefined;
    while (!runid) {
        runid = concurrentRunIDs.find(id => async () => {
            const run = await client.run(id).get();
            if (!run) {
                throw new Error(`Failed to get run ${id}`);
            }
            return run.status === 'SUCCEEDED' || run.status === 'FAILED';
        });
        if (!runid) {
            // sleep
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    const run = await client.run(runid).waitForFinish();

    console.log(`Run ${run.id} finished in ${run.stats.runTimeSecs} seconds`);
    const { pullToStartTime, startToSystemTime } = await computeLogTimes(run);
    concurrentRunIDs.shift(); // Remove the finished run from the list

    return {
        pullToStartTime,
        startToSystemTime,
        run,
    }
}

async function runBenchmark() {
    // Calculate max concurrent runs to avoid memory overload
    const maxConcurrentRuns = Math.floor(MAX_MEMORY_GB / ACTOR_MEMORY_GB);
    console.log(`Starting ${MAX_RUNS} runs with ${ACTOR_MEMORY_GB}GB per run, max ${maxConcurrentRuns} concurrent`);

    // Track runs
    const finishedRuns: ActorRun[] = [];
    const concurrentRunIDs: string[] = [];

    // Extracted times from logs
    // Time to pull the Actor container
    const logPullToStartTimes: number[] = [];
    // Time from starting the container to the first system log
    const logStartToSystemTimes: number[] = [];

    // Actor run loop
    while (finishedRuns.length + concurrentRunIDs.length < MAX_RUNS) {
        if (concurrentRunIDs.length >= maxConcurrentRuns) {
            const { pullToStartTime, startToSystemTime, run } = await waitForRunFinishAndHandle(concurrentRunIDs);
            finishedRuns.push(run);
            logPullToStartTimes.push(pullToStartTime);
            logStartToSystemTimes.push(startToSystemTime);
        }

        const run = await client.actor(ACTOR_NAME).start(ACTOR_INPUT, { memory: ACTOR_MEMORY_GB * 1024 });
        console.log(`Started run ${run.id} with ${ACTOR_MEMORY_GB}GB memory (${finishedRuns.length} finished, ${concurrentRunIDs.length} concurrent)`);
        concurrentRunIDs.push(run.id);
    }
    // Wait for remaining runs to finish
    while (concurrentRunIDs.length > 0) {
        const { pullToStartTime, startToSystemTime, run } = await waitForRunFinishAndHandle(concurrentRunIDs);
        finishedRuns.push(run);
        logPullToStartTimes.push(pullToStartTime);
        logStartToSystemTimes.push(startToSystemTime);
    }

    // Calculate run times
    const runTimes: number[] = finishedRuns.map(run => run.stats.runTimeSecs);

    // Log pull to start times
    const averagePullToStartTime = logPullToStartTimes.reduce((sum, time) => sum + time, 0) / logPullToStartTimes.length;
    const medianPullToStartTime = (() => {
        const sorted = [...logPullToStartTimes].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    })();
    const minPullToStartTime = Math.min(...logPullToStartTimes);
    const maxPullToStartTime = Math.max(...logPullToStartTimes);
    const stdDevPullToStartTime = Math.sqrt(logPullToStartTimes.reduce((sum, time) => sum + Math.pow(time - averagePullToStartTime, 2), 0) / logPullToStartTimes.length);

    // Log start to system times
    const averageStartToSystemTime = logStartToSystemTimes.reduce((sum, time) => sum + time, 0) / logStartToSystemTimes.length;
    const medianStartToSystemTime = (() => {
        const sorted = [...logStartToSystemTimes].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    })();
    const minStartToSystemTime = Math.min(...logStartToSystemTimes);
    const maxStartToSystemTime = Math.max(...logStartToSystemTimes);
    const stdDevStartToSystemTime = Math.sqrt(logStartToSystemTimes.reduce((sum, time) => sum + Math.pow(time - averageStartToSystemTime, 2), 0) / logStartToSystemTimes.length);

    // Compute average run time
    const averageRunTime = runTimes.reduce((sum, time) => sum + time, 0) / runTimes.length;
    const medianRunTime = (() => {
      const sorted = [...runTimes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    })();
    const minRunTime = Math.min(...runTimes);
    const maxRunTime = Math.max(...runTimes);
    const stdDevRunTime = Math.sqrt(runTimes.reduce((sum, time) => sum + Math.pow(time - averageRunTime, 2), 0) / runTimes.length);

    // Log results
    console.log(`Completed ${MAX_RUNS} runs`);
    console.log('------------------------------------------------------')
    console.log(`Average pull to start time: ${averagePullToStartTime.toFixed(2)} seconds`);
    console.log(`Median pull to start time: ${medianPullToStartTime.toFixed(2)} seconds`);
    console.log(`Min pull to start time: ${minPullToStartTime.toFixed(2)} seconds`);
    console.log(`Max pull to start time: ${maxPullToStartTime.toFixed(2)} seconds`);
    console.log(`Standard deviation of pull to start times: ${stdDevPullToStartTime.toFixed(2)} seconds`);
    console.log('------------------------------------------------------')
    console.log(`Average start to system time: ${averageStartToSystemTime.toFixed(2)} seconds`);
    console.log(`Median start to system time: ${medianStartToSystemTime.toFixed(2)} seconds`);
    console.log(`Min start to system time: ${minStartToSystemTime.toFixed(2)} seconds`);
    console.log(`Max start to system time: ${maxStartToSystemTime.toFixed(2)} seconds`);
    console.log(`Standard deviation of start to system times: ${stdDevStartToSystemTime.toFixed(2)} seconds`);
    console.log('------------------------------------------------------')
    console.log(`Average total run time: ${averageRunTime.toFixed(2)} seconds`);
    console.log(`Median total run time: ${medianRunTime.toFixed(2)} seconds`);
    console.log(`Min total run time: ${minRunTime.toFixed(2)} seconds`);
    console.log(`Max total run time: ${maxRunTime.toFixed(2)} seconds`);
    console.log(`Standard deviation of total run times: ${stdDevRunTime.toFixed(2)} seconds`);
}

// Execute benchmark
runBenchmark().catch(error => {
    console.error('Benchmark failed:', error.message);
    process.exit(1);
});
