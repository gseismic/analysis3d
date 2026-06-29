import {
  colorArrayFromValues,
  type NumericStats,
  type PlotArrays,
  type SurfaceMesh
} from "@analysis3d/core";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface Analysis3DViewerOptions {
  background?: string | number;
  pointSize?: number;
  preserveDrawingBuffer?: boolean;
  showGrid?: boolean;
}

export interface AxisDescriptor {
  label: string;
  stats: NumericStats;
  color?: string | number;
  unitHalfRange?: number;
  targetTickCount?: number;
}

export interface AxisGuideOptions {
  x: AxisDescriptor;
  y: AxisDescriptor;
  z: AxisDescriptor;
}

const DEFAULT_AXIS_HALF_RANGE = 1;
const DEFAULT_TARGET_MAJOR_TICKS = 6;
const MINOR_TICK_DIVISIONS = 5;
const MAJOR_TICK_SIZE = 0.095;
const MINOR_TICK_SIZE = 0.052;

interface AxisTick {
  value: number;
  unit: number;
  label: string;
}

interface AxisScale {
  descriptor: AxisDescriptor;
  unitMin: number;
  unitMax: number;
  majorStep: number;
  majorTicks: AxisTick[];
  minorTicks: AxisTick[];
}

interface AxisLayout {
  x: AxisScale;
  y: AxisScale;
  z: AxisScale;
}

export class Analysis3DViewer {
  readonly container: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private readonly dataGroup = new THREE.Group();
  private readonly axisGuideGroup = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private disposed = false;
  private pointSize: number;

  constructor(container: HTMLElement, options: Analysis3DViewerOptions = {}) {
    this.container = container;
    this.pointSize = options.pointSize ?? 2.2;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(options.background ?? "#101418");
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 100);
    this.camera.position.set(2.4, 1.8, 2.6);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.scene.add(this.dataGroup);
    this.scene.add(this.axisGuideGroup);
    this.installBaseScene(options.showGrid ?? true);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  setPointCloud(plot: PlotArrays): void {
    this.clearData();
    const geometry = new THREE.BufferGeometry();
    const colors = colorArrayFromValues(plot.colorValues, plot.stats.color);
    geometry.setAttribute("position", new THREE.BufferAttribute(plot.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const material = new THREE.PointsMaterial({
      size: this.pointSize,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    points.name = "analysis3d-point-cloud";
    this.dataGroup.add(points);
    this.setAxisGuide({
      x: { label: plot.mapping.x, stats: plot.stats.x, color: "#5bbcff" },
      y: { label: plot.mapping.z, stats: plot.stats.z, color: "#f5d76e" },
      z: { label: plot.mapping.y, stats: plot.stats.y, color: "#42c49e" }
    });
    this.fitCamera();
  }

  setSurface(surface: SurfaceMesh, axes?: AxisGuideOptions): void {
    this.clearData();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(surface.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(surface.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.05,
      transparent: true,
      opacity: 0.96
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "analysis3d-surface";
    this.dataGroup.add(mesh);

    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: "#d8dee9", transparent: true, opacity: 0.18 })
    );
    wireframe.name = "analysis3d-surface-wireframe";
    this.dataGroup.add(wireframe);
    if (axes) {
      this.setAxisGuide(axes);
    } else {
      this.clearAxisGuide();
    }
    this.fitCamera();
  }

  clearData(): void {
    for (const object of [...this.dataGroup.children]) {
      this.dataGroup.remove(object);
      disposeObject(object);
    }
  }

  setAxisGuide(options: AxisGuideOptions): void {
    this.clearAxisGuide();
    const layout = createAxisLayout(options);
    const origin = new THREE.Vector3(layout.x.unitMin, layout.y.unitMin, layout.z.unitMin);
    this.addReferenceGrid(layout);
    this.addAxisGuideLine({
      start: origin,
      end: new THREE.Vector3(layout.x.unitMax, origin.y, origin.z),
      scale: layout.x,
      axisName: "X",
      tickDirection: new THREE.Vector3(0, 0, 1),
      tickLabelOffset: new THREE.Vector3(0, -0.12, 0.14),
      labelPosition: new THREE.Vector3(layout.x.unitMax + 0.18, origin.y + 0.02, origin.z)
    });
    this.addAxisGuideLine({
      start: origin,
      end: new THREE.Vector3(origin.x, layout.y.unitMax, origin.z),
      scale: layout.y,
      axisName: "Y height",
      tickDirection: new THREE.Vector3(1, 0, 0),
      tickLabelOffset: new THREE.Vector3(-0.18, 0, 0.04),
      labelPosition: new THREE.Vector3(origin.x - 0.16, layout.y.unitMax + 0.16, origin.z)
    });
    this.addAxisGuideLine({
      start: origin,
      end: new THREE.Vector3(origin.x, origin.y, layout.z.unitMax),
      scale: layout.z,
      axisName: "Z depth",
      tickDirection: new THREE.Vector3(1, 0, 0),
      tickLabelOffset: new THREE.Vector3(0.14, -0.13, 0),
      labelPosition: new THREE.Vector3(origin.x, origin.y + 0.02, layout.z.unitMax + 0.22)
    });
  }

  clearAxisGuide(): void {
    for (const object of [...this.axisGuideGroup.children]) {
      this.axisGuideGroup.remove(object);
      disposeObject(object);
    }
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.clearData();
    this.clearAxisGuide();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private installBaseScene(_showGrid: boolean): void {
    const ambientLight = new THREE.AmbientLight("#ffffff", 0.75);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight("#ffffff", 1.2);
    directionalLight.position.set(3, 4, 2);
    this.scene.add(directionalLight);
  }

  private fitCamera(): void {
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(2.4, 1.8, 2.6);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  private animate = (): void => {
    if (this.disposed) {
      return;
    }
    this.animationFrame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private addAxisGuideLine(options: {
    start: THREE.Vector3;
    end: THREE.Vector3;
    scale: AxisScale;
    axisName: string;
    tickDirection: THREE.Vector3;
    tickLabelOffset: THREE.Vector3;
    labelPosition: THREE.Vector3;
  }): void {
    const color = new THREE.Color(options.scale.descriptor.color ?? "#ffffff");
    this.axisGuideGroup.add(createLine(
      [options.start, options.end],
      {
        color,
        name: `analysis3d-axis-${options.axisName}`,
        opacity: 0.95
      }
    ));
    this.axisGuideGroup.add(createTextSprite(`${options.axisName}: ${options.scale.descriptor.label}`, {
      color,
      position: options.labelPosition,
      name: `analysis3d-axis-${options.axisName}-label`,
      scale: 0.18,
      weight: 700
    }));
    this.addAxisTicks(options, color);
  }

  private addAxisTicks(options: {
    start: THREE.Vector3;
    end: THREE.Vector3;
    scale: AxisScale;
    axisName: string;
    tickDirection: THREE.Vector3;
    tickLabelOffset: THREE.Vector3;
  }, color: THREE.Color): void {
    const tickDirection = options.tickDirection.clone().normalize();
    options.scale.minorTicks.forEach((tick, index) => {
      const position = projectTick(options.start, options.end, options.scale, tick);
      this.axisGuideGroup.add(createTickLine({
        position,
        tickDirection,
        tickSize: MINOR_TICK_SIZE,
        color,
        opacity: 0.42,
        name: `analysis3d-axis-${options.axisName}-minor-tick-${index}`
      }));
    });
    options.scale.majorTicks.forEach((tick, index) => {
      const position = projectTick(options.start, options.end, options.scale, tick);
      this.axisGuideGroup.add(createTickLine({
        position,
        tickDirection,
        tickSize: MAJOR_TICK_SIZE,
        color,
        opacity: 0.9,
        name: `analysis3d-axis-${options.axisName}-major-tick-${index}`
      }));
      this.axisGuideGroup.add(createTextSprite(tick.label, {
        color,
        position: position.clone().add(options.tickLabelOffset),
        name: `analysis3d-axis-${options.axisName}-major-label-${index}`,
        scale: 0.095
      }));
    });
  }

  private addReferenceGrid(layout: AxisLayout): void {
    const bottomColor = new THREE.Color("#6a7786");
    const heightColor = new THREE.Color("#6d7780");
    const yBase = layout.y.unitMin;
    const zBase = layout.z.unitMin;
    const xBase = layout.x.unitMin;

    layout.x.majorTicks.forEach((tick, index) => {
      this.axisGuideGroup.add(createLine(
        [
          new THREE.Vector3(tick.unit, yBase, layout.z.unitMin),
          new THREE.Vector3(tick.unit, yBase, layout.z.unitMax)
        ],
        {
          color: bottomColor,
          name: `analysis3d-axis-grid-x-major-${index}`,
          opacity: 0.16
        }
      ));
    });
    layout.z.majorTicks.forEach((tick, index) => {
      this.axisGuideGroup.add(createLine(
        [
          new THREE.Vector3(layout.x.unitMin, yBase, tick.unit),
          new THREE.Vector3(layout.x.unitMax, yBase, tick.unit)
        ],
        {
          color: bottomColor,
          name: `analysis3d-axis-grid-z-major-${index}`,
          opacity: 0.16
        }
      ));
    });
    layout.y.majorTicks.forEach((tick, index) => {
      this.axisGuideGroup.add(createLine(
        [
          new THREE.Vector3(xBase, tick.unit, zBase),
          new THREE.Vector3(layout.x.unitMax, tick.unit, zBase)
        ],
        {
          color: heightColor,
          name: `analysis3d-axis-grid-y-major-${index}`,
          opacity: 0.14
        }
      ));
    });
  }
}

function createAxisLayout(options: AxisGuideOptions): AxisLayout {
  return {
    x: createAxisScale(options.x),
    y: createAxisScale(options.y),
    z: createAxisScale(options.z)
  };
}

function createAxisScale(descriptor: AxisDescriptor): AxisScale {
  const unitHalfRange = descriptor.unitHalfRange ?? DEFAULT_AXIS_HALF_RANGE;
  const unitMin = -unitHalfRange;
  const unitMax = unitHalfRange;
  const majorStep = createNiceStep(descriptor.stats, descriptor.targetTickCount ?? DEFAULT_TARGET_MAJOR_TICKS);
  const majorTicks = createMajorTicks(descriptor, unitMin, unitMax, majorStep);
  return {
    descriptor,
    unitMin,
    unitMax,
    majorStep,
    majorTicks,
    minorTicks: createMinorTicks(descriptor, unitMin, unitMax, majorStep, majorTicks)
  };
}

function createMajorTicks(
  descriptor: AxisDescriptor,
  unitMin: number,
  unitMax: number,
  step: number
): AxisTick[] {
  const { min, max } = descriptor.stats;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [];
  }
  if (max === min || step === 0) {
    return [{
      value: min,
      unit: (unitMin + unitMax) / 2,
      label: formatAxisValue(min)
    }];
  }

  const epsilon = Math.abs(step) * 1e-6;
  const start = Math.ceil((min - epsilon) / step) * step;
  const stop = Math.floor((max + epsilon) / step) * step;
  const ticks: AxisTick[] = [];
  for (let value = start; value <= stop + epsilon; value += step) {
    const rounded = roundToStep(value, step);
    ticks.push({
      value: rounded,
      unit: valueToUnit(rounded, descriptor.stats, unitMin, unitMax),
      label: formatAxisValue(rounded, step)
    });
  }

  if (ticks.length >= 2) {
    return ticks;
  }

  return [min, max].map((value) => ({
    value,
    unit: valueToUnit(value, descriptor.stats, unitMin, unitMax),
    label: formatAxisValue(value, step)
  }));
}

function createMinorTicks(
  descriptor: AxisDescriptor,
  unitMin: number,
  unitMax: number,
  majorStep: number,
  majorTicks: AxisTick[]
): AxisTick[] {
  const { min, max } = descriptor.stats;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min || majorStep === 0) {
    return [];
  }
  const minorStep = majorStep / MINOR_TICK_DIVISIONS;
  const maxMinorTicks = 80;
  const epsilon = Math.abs(minorStep) * 1e-6;
  const majorValues = new Set(majorTicks.map((tick) => roundToStep(tick.value, minorStep).toString()));
  const start = Math.ceil((min - epsilon) / minorStep) * minorStep;
  const stop = Math.floor((max + epsilon) / minorStep) * minorStep;
  const ticks: AxisTick[] = [];

  for (let value = start; value <= stop + epsilon && ticks.length < maxMinorTicks; value += minorStep) {
    const rounded = roundToStep(value, minorStep);
    if (majorValues.has(rounded.toString())) {
      continue;
    }
    ticks.push({
      value: rounded,
      unit: valueToUnit(rounded, descriptor.stats, unitMin, unitMax),
      label: ""
    });
  }

  return ticks;
}

function createNiceStep(stats: NumericStats, targetTickCount: number): number {
  const range = stats.max - stats.min;
  if (!Number.isFinite(range) || range === 0) {
    return 0;
  }
  const rawStep = Math.abs(range) / Math.max(1, targetTickCount);
  const power = Math.floor(Math.log10(rawStep));
  const base = 10 ** power;
  const error = rawStep / base;
  const factor = error >= Math.sqrt(50)
    ? 10
    : error >= Math.sqrt(10)
      ? 5
      : error >= Math.sqrt(2)
        ? 2
        : 1;
  return factor * base;
}

function valueToUnit(value: number, stats: NumericStats, unitMin: number, unitMax: number): number {
  const range = stats.max - stats.min;
  if (!Number.isFinite(value) || !Number.isFinite(range) || range === 0) {
    return (unitMin + unitMax) / 2;
  }
  const ratio = (value - stats.min) / range;
  return unitMin + ratio * (unitMax - unitMin);
}

function projectTick(start: THREE.Vector3, end: THREE.Vector3, scale: AxisScale, tick: AxisTick): THREE.Vector3 {
  const ratio = scale.unitMax === scale.unitMin
    ? 0.5
    : (tick.unit - scale.unitMin) / (scale.unitMax - scale.unitMin);
  return start.clone().lerp(end, ratio);
}

function createTickLine(options: {
  position: THREE.Vector3;
  tickDirection: THREE.Vector3;
  tickSize: number;
  color: THREE.Color;
  opacity: number;
  name: string;
}): THREE.Line {
  const tickStart = options.position.clone().addScaledVector(options.tickDirection, -options.tickSize / 2);
  const tickEnd = options.position.clone().addScaledVector(options.tickDirection, options.tickSize / 2);
  return createLine([tickStart, tickEnd], {
    color: options.color,
    name: options.name,
    opacity: options.opacity
  });
}

function createLine(points: THREE.Vector3[], options: {
  color: THREE.Color;
  name: string;
  opacity: number;
  userData?: Record<string, unknown>;
}): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: options.color,
    transparent: options.opacity < 1,
    opacity: options.opacity,
    depthTest: false
  });
  const line = new THREE.Line(geometry, material);
  line.name = options.name;
  if (options.userData) {
    Object.assign(line.userData, options.userData);
  }
  line.renderOrder = 4;
  return line;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const maybeMesh = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    maybeMesh.geometry?.dispose();
    const material = maybeMesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => disposeMaterial(entry));
    } else {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material?: THREE.Material): void {
  if (!material) {
    return;
  }
  const maybeSprite = material as THREE.Material & { map?: THREE.Texture };
  maybeSprite.map?.dispose();
  material.dispose();
}

function createTextSprite(optionsText: string, options: {
  color: THREE.Color;
  name?: string;
  position: THREE.Vector3;
  scale: number;
  weight?: number;
}): THREE.Sprite {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建文字纹理");
  }
  const fontSize = 34 * pixelRatio;
  context.font = `${options.weight ?? 600} ${fontSize}px Inter, Arial, sans-serif`;
  const metrics = context.measureText(optionsText);
  canvas.width = Math.ceil(metrics.width + 28 * pixelRatio);
  canvas.height = Math.ceil(52 * pixelRatio);
  context.font = `${options.weight ?? 600} ${fontSize}px Inter, Arial, sans-serif`;
  context.textBaseline = "middle";
  context.fillStyle = "rgba(8, 12, 16, 0.72)";
  roundRect(context, 0, 0, canvas.width, canvas.height, 8 * pixelRatio);
  context.fill();
  context.fillStyle = `#${options.color.getHexString()}`;
  context.fillText(optionsText, 14 * pixelRatio, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  if (options.name) {
    sprite.name = options.name;
  }
  sprite.userData.text = optionsText;
  sprite.position.copy(options.position);
  sprite.scale.set(options.scale * (canvas.width / canvas.height), options.scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || step === 0) {
    return value;
  }
  const decimals = Math.max(0, Math.ceil(-Math.log10(Math.abs(step))) + 2);
  return Number(value.toFixed(Math.min(12, decimals)));
}

function formatAxisValue(value: number, step?: number): string {
  if (!Number.isFinite(value)) {
    return "NaN";
  }
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return `${trimNumeric(value / 1_000_000_000, 2)}B`;
  }
  if (absolute >= 1_000_000) {
    return `${trimNumeric(value / 1_000_000, 2)}M`;
  }
  if (absolute >= 10_000) {
    return `${trimNumeric(value / 1_000, 2)}k`;
  }
  if (absolute > 0 && absolute < 0.001) {
    return value.toExponential(2);
  }
  if (!step || !Number.isFinite(step)) {
    return Number(value.toPrecision(4)).toString();
  }
  const decimals = Math.max(0, Math.min(6, Math.ceil(-Math.log10(Math.abs(step))) + 1));
  return trimNumeric(value, decimals);
}

function trimNumeric(value: number, decimals: number): string {
  return value.toFixed(decimals)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}
