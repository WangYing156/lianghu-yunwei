/**
 * 局部竣工模型风机 / 送风口真实几何（由 scripts/extract-fan-rig.mjs 从 glb 自动提取，勿手改）。
 * center / axis 为 glb 网格局部坐标（CustomShader 的 positionMC），所有瓦片共享同一节点变换。
 */
export interface PartialAirDevice {
  tile: string
  /** 瓦片内 _FEATURE_ID_0 */
  featureId: number
  /** scenetree 构件 id */
  elementId: string
  name: string
  center: [number, number, number]
  /** 风机：射流方向（叶轮旋转轴）；送风口：出风法向 */
  axis: [number, number, number]
  length: number
  radius: number
}
export interface PartialFanRig extends PartialAirDevice {
  deck: 'upper' | 'lower'
}

/** positionMC → tileset 局部坐标（列主序），运行时再乘 tileset.root.computedTransform */
export const PARTIAL_MC_TO_TILESET: readonly number[] = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]

export const PARTIAL_FAN_RIGS: readonly PartialFanRig[] = [
  {
    "tile": "NoLod_6.glb",
    "featureId": 43,
    "elementId": "6974ce5ac660610b44d9b9fed0ff9548",
    "name": "风机_八片扭转叶轮003",
    "center": [
      79.439,
      125.6062,
      19.6991
    ],
    "axis": [
      -0.433557,
      -0.900672,
      -0.028599
    ],
    "length": 4.007,
    "radius": 0.5,
    "deck": "lower"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 44,
    "elementId": "735b90b4568125ed6c3f678819b6e058",
    "name": "风机_八片扭转叶轮015",
    "center": [
      -124.0444,
      -256.8288,
      7.461
    ],
    "axis": [
      0.4949,
      0.868512,
      0.027587
    ],
    "length": 4.007,
    "radius": 0.499,
    "deck": "upper"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 45,
    "elementId": "7cbbc409ec990f19c78c75bd1e06f215",
    "name": "风机_八片扭转叶轮014",
    "center": [
      -112.7104,
      -263.4936,
      7.4587
    ],
    "axis": [
      0.4949,
      0.868512,
      0.027587
    ],
    "length": 4.007,
    "radius": 0.5,
    "deck": "upper"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 46,
    "elementId": "d2ddea18f00665ce8623e36bd4e3c7c5",
    "name": "风机_八片扭转叶轮013",
    "center": [
      -82.8302,
      -186.6076,
      5.2326
    ],
    "axis": [
      -0.4949,
      -0.868512,
      -0.027587
    ],
    "length": 4.007,
    "radius": 0.499,
    "deck": "lower"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 47,
    "elementId": "f4b9ec30ad9f68f89b29639786cb62ef",
    "name": "风机_八片扭转叶轮006",
    "center": [
      -13.0148,
      -83.1582,
      15.3063
    ],
    "axis": [
      0.433557,
      0.900672,
      0.028599
    ],
    "length": 4.007,
    "radius": 0.499,
    "deck": "upper"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 48,
    "elementId": "2a38a4a9316c49e5a833517c45d31070",
    "name": "风机_八片扭转叶轮008",
    "center": [
      -13.0143,
      -83.1552,
      9.9545
    ],
    "axis": [
      -0.433557,
      -0.900672,
      -0.028599
    ],
    "length": 4.007,
    "radius": 0.5,
    "deck": "lower"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 49,
    "elementId": "7f39f8317fbdb1988ef4c628eba02591",
    "name": "风机_八片扭转叶轮017",
    "center": [
      -124.0438,
      -256.8257,
      1.9041
    ],
    "axis": [
      -0.4949,
      -0.868512,
      -0.027587
    ],
    "length": 4.007,
    "radius": 0.498,
    "deck": "lower"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 50,
    "elementId": "ea5d2f1c4608232e07d3aa3d998e5135",
    "name": "风机_八片扭转叶轮016",
    "center": [
      -112.7098,
      -263.4905,
      1.9017
    ],
    "axis": [
      -0.4949,
      -0.868512,
      -0.027587
    ],
    "length": 4.007,
    "radius": 0.499,
    "deck": "lower"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 51,
    "elementId": "d1fe173d08e959397adf34b1d77e88d7",
    "name": "风机_八片扭转叶轮011",
    "center": [
      -82.8308,
      -186.6107,
      10.7896
    ],
    "axis": [
      0.4949,
      0.868512,
      0.027587
    ],
    "length": 4.007,
    "radius": 0.5,
    "deck": "upper"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 52,
    "elementId": "9778d5d219c5080b9a6a17bef029331c",
    "name": "风机_八片扭转叶轮010",
    "center": [
      -71.4971,
      -193.2755,
      10.7872
    ],
    "axis": [
      0.4949,
      0.868512,
      0.027587
    ],
    "length": 4.007,
    "radius": 0.497,
    "deck": "upper"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 53,
    "elementId": "fbd7939d674997cdb4692d34de8633c4",
    "name": "风机_八片扭转叶轮012",
    "center": [
      -71.4964,
      -193.2725,
      5.2303
    ],
    "axis": [
      -0.4949,
      -0.868512,
      -0.027587
    ],
    "length": 4.007,
    "radius": 0.5,
    "deck": "lower"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 54,
    "elementId": "54229abfcfa5649e7003b83dd4755294",
    "name": "风机_八片扭转叶轮007",
    "center": [
      -17.621,
      -81.2428,
      15.3069
    ],
    "axis": [
      0.433557,
      0.900672,
      0.028599
    ],
    "length": 4.007,
    "radius": 0.5,
    "deck": "upper"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 55,
    "elementId": "3ef815416f775098fe977004015c6193",
    "name": "风机_八片扭转叶轮009",
    "center": [
      -17.6205,
      -81.2398,
      9.9551
    ],
    "axis": [
      -0.433557,
      -0.900672,
      -0.028599
    ],
    "length": 4.007,
    "radius": 0.499,
    "deck": "lower"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 56,
    "elementId": "e2ef524fbf3d9fe611d5a8e90fefdc9c",
    "name": "风机_八片扭转叶轮005",
    "center": [
      29.5955,
      17.0004,
      14.8135
    ],
    "axis": [
      -0.433557,
      -0.900672,
      -0.028599
    ],
    "length": 4.007,
    "radius": 0.5,
    "deck": "lower"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 57,
    "elementId": "f0935e4cd5920aa6c7c996a5ee53a70f",
    "name": "风机_八片扭转叶轮002",
    "center": [
      84.0453,
      123.691,
      19.6986
    ],
    "axis": [
      -0.433557,
      -0.900672,
      -0.028599
    ],
    "length": 4.007,
    "radius": 0.5,
    "deck": "lower"
  },
  {
    "tile": "NoLod_6.glb",
    "featureId": 58,
    "elementId": "f899139df5e1059396431415e770c6dd",
    "name": "风机_八片扭转叶轮004",
    "center": [
      34.2016,
      15.085,
      14.8129
    ],
    "axis": [
      -0.433557,
      -0.900672,
      -0.028599
    ],
    "length": 4.007,
    "radius": 0.5,
    "deck": "lower"
  }
]

export const PARTIAL_AIR_VENTS: readonly PartialAirDevice[] = [
  {
    "tile": "NoLod_6.glb",
    "featureId": 0,
    "elementId": "47d1e990583c9c67424d369f3414728e",
    "name": "常闭加压送风口 加压送风 [2995812]",
    "center": [
      -17.0083,
      -71.7613,
      9.7052
    ],
    "axis": [
      0.884506,
      -0.466524,
      0.001931
    ],
    "length": 0.335,
    "radius": 0.862
  }
]
