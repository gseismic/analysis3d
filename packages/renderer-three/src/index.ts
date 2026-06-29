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
}

export interface AxisGuideOptions {
  x: AxisDescriptor;
  y: AxisDescriptor;
  z: AxisDescriptor;
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
    const length = 1.28;
    const origin = new THREE.Vector3(-1.05, -1.02, -1.05);
    this.addAxisGuideLine({
      start: origin,
      end: new THREE.Vector3(length, origin.y, origin.z),
      descriptor: options.x,
      axisName: "X",
      minPosition: new THREE.Vector3(-1.05, origin.y - 0.08, origin.z),
      maxPosition: new THREE.Vector3(length, origin.y - 0.08, origin.z),
      labelPosition: new THREE.Vector3(length + 0.18, origin.y + 0.02, origin.z)
    });
    this.addAxisGuideLine({
      start: origin,
      end: new THREE.Vector3(origin.x, length, origin.z),
      descriptor: options.y,
      axisName: "Y height",
      minPosition: new THREE.Vector3(origin.x - 0.1, origin.y, origin.z),
      maxPosition: new THREE.Vector3(origin.x - 0.1, length, origin.z),
      labelPosition: new THREE.Vector3(origin.x - 0.16, length + 0.16, origin.z)
    });
    this.addAxisGuideLine({
      start: origin,
      end: new THREE.Vector3(origin.x, origin.y, length),
      descriptor: options.z,
      axisName: "Z depth",
      minPosition: new THREE.Vector3(origin.x, origin.y - 0.08, origin.z),
      maxPosition: new THREE.Vector3(origin.x, origin.y - 0.08, length),
      labelPosition: new THREE.Vector3(origin.x, origin.y + 0.02, length + 0.22)
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

  private installBaseScene(showGrid: boolean): void {
    const ambientLight = new THREE.AmbientLight("#ffffff", 0.75);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight("#ffffff", 1.2);
    directionalLight.position.set(3, 4, 2);
    this.scene.add(directionalLight);

    if (showGrid) {
      const grid = new THREE.GridHelper(2.4, 12, "#607080", "#26313c");
      grid.position.y = -1.05;
      this.scene.add(grid);
      const axes = new THREE.AxesHelper(1.35);
      axes.position.set(-1.08, -1.04, -1.08);
      this.scene.add(axes);
    }
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
    descriptor: AxisDescriptor;
    axisName: string;
    minPosition: THREE.Vector3;
    maxPosition: THREE.Vector3;
    labelPosition: THREE.Vector3;
  }): void {
    const color = new THREE.Color(options.descriptor.color ?? "#ffffff");
    const geometry = new THREE.BufferGeometry().setFromPoints([options.start, options.end]);
    const material = new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geometry, material);
    line.name = `analysis3d-axis-${options.axisName}`;
    this.axisGuideGroup.add(line);
    this.axisGuideGroup.add(createTextSprite(`${options.axisName}: ${options.descriptor.label}`, {
      color,
      position: options.labelPosition,
      scale: 0.18,
      weight: 700
    }));
    this.axisGuideGroup.add(createTextSprite(formatAxisValue(options.descriptor.stats.min), {
      color,
      position: options.minPosition,
      scale: 0.12
    }));
    this.axisGuideGroup.add(createTextSprite(formatAxisValue(options.descriptor.stats.max), {
      color,
      position: options.maxPosition,
      scale: 0.12
    }));
  }
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

function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "NaN";
  }
  const absolute = Math.abs(value);
  if ((absolute > 0 && absolute < 0.001) || absolute >= 100000) {
    return value.toExponential(2);
  }
  return Number(value.toPrecision(4)).toString();
}
