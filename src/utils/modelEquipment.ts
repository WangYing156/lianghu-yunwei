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
export function parseModelEquipment(raw: { scenes?: SceneNode[] }): ModelEquipment[] {
  const items = new Map<string, ModelEquipment>()
  function visit(node: SceneNode) {
    const category = categories.find(([pattern]) => pattern.test(node.name ?? ''))?.[1]
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
