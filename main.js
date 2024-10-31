import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

// Scene, Camera, and Renderer Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputEncoding = THREE.sRGBEncoding;

// Camera settings
const cameraSettings = {
  exposure: 1.0,
  shutterSpeed: 800 / 200,
  iso: 100,
  fStop: 5.6,
};

function updateCameraExposure() {
  const ev = Math.log2(
    (cameraSettings.fStop * cameraSettings.fStop) / cameraSettings.shutterSpeed
  );
  const exposureValue = Math.pow(2, -ev) * (cameraSettings.iso / 100);
  renderer.toneMappingExposure = exposureValue * cameraSettings.exposure;
}

updateCameraExposure();

// Background color
function setBackgroundColor(r, g, b) {
  scene.background = new THREE.Color(r / 255, g / 255, b / 255);
}

setBackgroundColor(30, 30, 30);

// Lighting Setup
function addHDRILighting() {
  const rgbeLoader = new RGBELoader();
  rgbeLoader.load(
    "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/zwartkops_pit_1k.hdr",
    function (texture) {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
    }
  );
}

function addStudioLighting() {
  const keyLight = new THREE.DirectionalLight(0xffffff, 15);
  keyLight.position.set(5, 5, 5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 10);
  fillLight.position.set(-5, 5, 5);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0xffffff, 7);
  backLight.position.set(0, 5, -5);
  scene.add(backLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
}

addHDRILighting();
addStudioLighting();

// Texture Loading
const textureLoader = new THREE.TextureLoader();
const loadTexture = (name) => textureLoader.load(`/textures/${name}.jpeg`);

const textures = {
  diffuse: loadTexture("diffuse"),
  bump: loadTexture("bump"),
  height: loadTexture("height"),
  internal: loadTexture("internal"),
  normal: loadTexture("normal"),
  specular: loadTexture("specular"),
  occlusion: loadTexture("occlusion"),
};

// Model Loading and Setup
function loadModel() {
  const gltfLoader = new GLTFLoader();
  gltfLoader.load("./shoe.glb", function (gltf) {
    const object = gltf.scene;
    object.traverse((child) => {
      if (child.isMesh) {
        applyTextures(child);
      }
    });
    scene.add(object);
    centerAndFitObject(object);
  });
}

function applyTextures(mesh) {
  const newMaterial = new THREE.MeshStandardMaterial({
    map: textures.diffuse,
    bumpMap: textures.bump,
    normalMap: textures.normal,
    aoMap: textures.internal,
    aoMapIntensity: 0.1,
    occlusionMap: textures.occlusion,
    roughness: 0.5,
    metalness: 0.1,
    envMapIntensity: 1.0,
  });

  mesh.material = newMaterial;

  if (!mesh.geometry.attributes.uv2) {
    mesh.geometry.setAttribute("uv2", mesh.geometry.attributes.uv);
  }
}

function centerAndFitObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const boxCenter = box.getCenter(new THREE.Vector3());
  const boxSize = box.getSize(new THREE.Vector3());

  object.position.sub(boxCenter);

  const maxDimension = Math.max(boxSize.x, boxSize.y, boxSize.z);
  const cameraDistance =
    maxDimension / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 1.5);

  camera.position.set(0, 0, cameraDistance);
  camera.lookAt(0, 0, 0);

  controls.target.set(0, 0, 0);
  controls.update();
}

loadModel();

// Controls Setup
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.1;
controls.maxDistance = 5;

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

// Event Listeners
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// UI Controls
document.getElementById("exposureSlider").addEventListener("input", (e) => {
  cameraSettings.exposure = parseFloat(e.target.value);
  updateCameraExposure();
});

document.getElementById("metalnessSlider").addEventListener("input", (e) => {
  const metalness = parseFloat(e.target.value);
  scene.traverse((child) => {
    if (child.isMesh) {
      child.material.metalness = metalness;
    }
  });
});

document.getElementById("bgColorPicker").addEventListener("input", (e) => {
  const color = new THREE.Color(e.target.value);
  setBackgroundColor(color.r * 255, color.g * 255, color.b * 255);
});
