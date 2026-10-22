export interface ModelEquipment {
  id: string
  name: string
  category: string
  modelId: string
  center: [number, number, number]
  radius: number
}
interface SceneNode {
  id?: string
  name?: string
  type?: string
  sphere?: number[]
  children?: SceneNode[]
}
const categories: [RegExp, string][] = [
  [/风机|送风口|风阀/, '通风设备'],
  [/摄像/, '视频监控'],
  [/泵/, '消防泵组'],
  [/烟感|感温|火焰|探测器/, '消防探测'],
  [/出口指示|标志/, '疏散指引'],
  [/喇叭|扬声器/, '应急广播'],
  [/灯/, '照明设备'],
]
/** 只读取带独立空间包围球的真实设备，排除整段合并构件/道路，不伪造 IoT 数据。 */
export function parseModelEquipment(raw: {
  scenes?: SceneNode[]
}): ModelEquipment[] {
  const items = new Map<string, ModelEquipment>()
  function visit(node: SceneNode) {
    const category = categories.find(([pattern]) =>
      pattern.test(node.name ?? ''),
    )?.[1]
    const sphere = node.sphere
    if (
      category &&
      node.id &&
      sphere?.length === 4 &&
      sphere.every(Number.isFinite) &&
      sphere[3] > 0 &&
      sphere[3] < 30
    ) {
      items.set(node.id, {
        id: node.id,
        name: node.name!,
        category,
        modelId: /\[(\d+)\]/.exec(node.name!)?.[1] ?? node.id,
        center: sphere.slice(0, 3) as [number, number, number],
        radius: sphere[3],
      })
    }
    node.children?.forEach(visit)
  }
  raw.scenes?.forEach(visit)
  return [...items.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category, 'zh-CN') ||
      a.modelId.localeCompare(b.modelId, undefined, { numeric: true }),
  )
}

/** 同一份静态目录供远景标注和巡游共享；失败清缓存，允许用户重试。 */
const catalogRequests = new Map<string, Promise<ModelEquipment[]>>()
export async function loadModelEquipment(
  url: string,
  signal?: AbortSignal,
): Promise<ModelEquipment[]> {
  url = new URL(url, globalThis.location?.href ?? 'http://localhost/').href
  let request = catalogRequests.get(url)
  if (!request) {
    request = fetch(url)
      .then(async (response) => {
        if (!response.ok)
          throw new Error('竣工模型设备目录加载失败，请检查 scenetree.json。')
        const items = parseModelEquipment(await response.json())
        if (!items.length) throw new Error('竣工模型中没有可定位的设备构件。')
        return items
      })
      .catch((error) => {
        catalogRequests.delete(url)
        throw error
      })
    catalogRequests.set(url, request)
  }
  const result = await request
  // 请求本身可在切换页面后用于下一个场景，但已退出的调用者不能回写状态。
  if (signal?.aborted) throw new DOMException('已取消加载', 'AbortError')
  return result
}
