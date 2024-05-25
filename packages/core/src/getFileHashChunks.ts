import { getArrayBufFromBlobs, getArrParts, sliceFile } from './utils'
import { crc32, md5 } from 'hash-wasm'
import { WorkerService } from './worker/worker-service'
import { MerkleTree } from './entity/merkle-tree'
import { isEmpty } from './utils/is'
import { FileMetaInfo } from './interface'
import { FileHashChunksParam, FileHashChunksResult } from './interface'
import { Strategy } from './enum'

let workerService: WorkerService | null = null

const DEFAULT_MAX_WORKERS = 8
const BORDER_COUNT = 100

function normalizeParam(param: FileHashChunksParam) {
  /**
   * Ts 编译器无法从 isEmpty 的调用结果自动推断出后续的变量类型, Ts 在类型层面不具备执行时判断函数逻辑的能力
   * 可以通过 明确地检查 undefined 或 使用 ! 或 使用类型断言来处理
   * 此处使用了 !
   */
  const normalizedParam: Required<FileHashChunksParam> = {
    file: param.file,
    chunkSize: isEmpty(param.chunkSize) ? 10 : param.chunkSize!, // 默认 10MB 分片大小
    maxWorkerCount: isEmpty(param.maxWorkerCount) ? DEFAULT_MAX_WORKERS : param.maxWorkerCount!, // 默认使用 8个 Worker 线程
    strategy: isEmpty(param.strategy) ? Strategy.mixed : param.strategy!, // 默认使用混合模式计算 hash
    borderCount: isEmpty(param.borderCount) ? BORDER_COUNT : param.borderCount!, // 默认以 100 分片数量作为边界
  }
  return normalizedParam
}

/**
 * 将文件进行分片, 并获取分片后的 hashList
 * @param param
 */
async function getFileHashChunks(param: FileHashChunksParam): Promise<FileHashChunksResult> {
  const { file, chunkSize, maxWorkerCount, strategy, borderCount } = normalizeParam(param)

  if (workerService === null) {
    workerService = new WorkerService(maxWorkerCount)
  }

  // 文件大小
  const fileSize = file.size / 1024

  // 文件元数据
  const metadata: FileMetaInfo = {
    name: file.name,
    size: fileSize,
    lastModified: file.lastModified,
    type: file.type,
  }

  // 文件分片
  const chunksBlob = sliceFile(file, chunkSize)
  let chunksHash: string[] = []

  if (chunksBlob.length === 1) {
    const unit8Array = new Uint8Array(await chunksBlob[0].arrayBuffer())
    chunksHash =
      strategy === Strategy.md5 || strategy === Strategy.mixed
        ? [await md5(unit8Array)]
        : [await crc32(unit8Array)]
  } else {
    let chunksBuf: ArrayBuffer[] = []
    // 将文件分片进行分组, 组内任务并行执行, 组外任务串行执行
    const chunksPart = getArrParts<Blob>(chunksBlob, maxWorkerCount)
    const tasks = chunksPart.map((part) => async () => {
      // 手动释放上一次用于计算 Hash 的 ArrayBuffer
      // 现在只会占用 MAX_WORKERS * 分片数量大小的内存
      chunksBuf.length = 0
      chunksBuf = await getArrayBufFromBlobs(part)
      // 执行不同的 hash 计算策略
      if (strategy === Strategy.md5) {
        return workerService!.getMD5ForFiles(chunksBuf)
      }
      if (strategy === Strategy.crc32) {
        return workerService!.getCRC32ForFiles(chunksBuf)
      } else {
        return chunksBlob.length <= borderCount
          ? workerService!.getMD5ForFiles(chunksBuf)
          : workerService!.getCRC32ForFiles(chunksBuf)
      }
    })
    for (const task of tasks) {
      const result = await task()
      chunksHash.push(...result)
    }
  }

  const merkleTree = new MerkleTree()
  await merkleTree.init(chunksHash)
  const fileHash = merkleTree.getRootHash()

  return {
    chunksBlob,
    chunksHash,
    merkleHash: fileHash,
    metadata,
  }
}

export default getFileHashChunks
