import {
  colorArrayFromValues,
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

export class Analysis3DViewer {
  readonly container: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private readonly dataGroup = new THREE.Group();
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
    this.fitCamera();
  }

  setSurface(surface: SurfaceMesh): void {
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
    this.fitCamera();
  }

  clearData(): void {
    for (const object of [...this.dataGroup.children]) {
      this.dataGroup.remove(object);
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
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
}
