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

const canvas = document.querySelector("#canvas");
if (!canvas) {
  throw new Error("Canvas element not found");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Camera settings
const cameraSettings = {
  exposure: 1.0,
  shutterSpeed: 10,
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

// Studio Lighting Setup
let studioLights;
function addStudioLighting() {
  // Key Light (main light)
  const keyLight = new THREE.DirectionalLight(0xffffff, 20);
  keyLight.position.set(5, 5, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  scene.add(keyLight);

  // Fill Light (softer light from opposite side)
  const fillLight = new THREE.DirectionalLight(0xffffff, 10);
  fillLight.position.set(-5, 3, 0);
  scene.add(fillLight);

  // Back Light (rim light)
  const backLight = new THREE.DirectionalLight(0xffffff, 15);
  backLight.position.set(0, 5, -5);
  scene.add(backLight);

  // Ambient Light (general fill)
  const ambientLight = new THREE.AmbientLight(0xffffff, 10);
  scene.add(ambientLight);

  return { keyLight, fillLight, backLight, ambientLight };
}

// Background color
function setBackgroundColor(r, g, b) {
  scene.background = new THREE.Color(r / 255, g / 255, b / 255);
}

setBackgroundColor(30, 30, 30);

// HDRI Lighting Setup with fallback
function addHDRILighting() {
  return new Promise((resolve, reject) => {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(
      // "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/zwartkops_pit_1k.hdr",
      function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;

        resolve(texture);
      },
      undefined,
      function (error) {
        console.warn(
          "HDRI loading failed, falling back to studio lighting:",
          error
        );
        resolve(addStudioLighting());
      }
    );
  });
}

// Texture Loading
const textureLoader = new THREE.TextureLoader();
const loadTexture = (name) => {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      `/textures/${name}.jpeg`,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      (error) => {
        console.warn(`Texture ${name} failed to load:`, error);
        resolve(null);
      }
    );
  });
};

async function loadTextures() {
  const textureNames = ["diffuse", "bump", "height", "occlusion"];

  const loadedTextures = {};
  await Promise.all(
    textureNames.map(async (name) => {
      try {
        const texture = await loadTexture(name);
        if (texture) {
          loadedTextures[name] = texture;
        }
      } catch (error) {
        console.warn(`Failed to load texture ${name}:`, error);
      }
    })
  );
  return loadedTextures;
}

function applyTextures(mesh, textures) {
  if (!textures || Object.keys(textures).length === 0) {
    console.warn("No textures available, using default material");
    mesh.material = new THREE.MeshStandardMaterial({
      roughness: 0.5,
      metalness: 0.1,
      envMapIntensity: 0.5,
    });
    return;
  }

  const newMaterial = new THREE.MeshStandardMaterial({
    map: textures.diffuse || null,
    bumpMap: textures.bump || null,
    normalMap: textures.normal || null,
    aoMap: textures.internal || null,
    aoMapIntensity: 0.5,
    occlusionMap: textures.occlusion || null,
    roughnessMap: textures.specular || null,
    roughness: 0.5,
    metalness: 0.1,
    envMapIntensity: 1.0,
  });

  mesh.material = newMaterial;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (!mesh.geometry.attributes.uv2 && mesh.geometry.attributes.uv) {
    mesh.geometry.setAttribute("uv2", mesh.geometry.attributes.uv);
  }
}

function loadModelAsync() {
  return new Promise((resolve, reject) => {
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      "/models/shoe.glb",
      (gltf) => resolve(gltf.scene),
      undefined,
      reject
    );
  });
}

async function loadAndSetupModel() {
  try {
    // Show loading indicator
    const loadingElement = document.getElementById("loading");
    if (loadingElement) {
      loadingElement.style.display = "block";
    }

    // Load everything concurrently
    const [object, textures, environment] = await Promise.all([
      loadModelAsync(),
      loadTextures(),
      addHDRILighting(),
    ]);

    // Apply textures to the model
    object.traverse((child) => {
      if (child.isMesh) {
        applyTextures(child, textures);
      }
    });

    // Add to scene only after everything is ready
    scene.add(object);
    centerAndFitObject(object);

    // Hide loading indicator
    if (loadingElement) {
      loadingElement.style.display = "none";
    }

    return object;
  } catch (error) {
    console.error("Error loading model or textures:", error);
    throw error;
  }
}

function centerAndFitObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  object.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const cameraDistance = (maxDim / 2 / Math.tan(fov / 2)) * 1.5;

  camera.position.set(0, 0, cameraDistance);
  camera.lookAt(0, 0, 0);

  // Update light positions based on object size
  if (studioLights) {
    const lightDistance = maxDim * 2;
    studioLights.keyLight.position.set(
      lightDistance,
      lightDistance,
      lightDistance
    );
    studioLights.fillLight.position.set(-lightDistance, lightDistance * 0.6, 0);
    studioLights.backLight.position.set(0, lightDistance, -lightDistance);

    // Update shadow camera
    studioLights.keyLight.shadow.camera.far = lightDistance * 4;
    studioLights.keyLight.shadow.camera.left = -maxDim;
    studioLights.keyLight.shadow.camera.right = maxDim;
    studioLights.keyLight.shadow.camera.top = maxDim;
    studioLights.keyLight.shadow.camera.bottom = -maxDim;
    studioLights.keyLight.shadow.camera.updateProjectionMatrix();
  }
}

// Controls Setup
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.1;
controls.maxDistance = 10;

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Event Listeners
window.addEventListener("resize", onWindowResize, false);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// UI Controls with null checks
const setupUIControls = () => {
  const exposureSlider = document.querySelector("#exposureSlider");
  const metalnessSlider = document.querySelector("#metalnessSlider");
  const bgColorPicker = document.querySelector("#bgColorPicker");

  if (exposureSlider) {
    exposureSlider.addEventListener("input", (e) => {
      cameraSettings.exposure = parseFloat(e.target.value);
      updateCameraExposure();
    });
  }

  if (metalnessSlider) {
    metalnessSlider.addEventListener("input", (e) => {
      const metalness = parseFloat(e.target.value);
      scene.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.metalness = metalness;
        }
      });
    });
  }

  if (bgColorPicker) {
    bgColorPicker.addEventListener("input", (e) => {
      const color = new THREE.Color(e.target.value);
      setBackgroundColor(color.r * 255, color.g * 255, color.b * 255);
    });
  }
};

// Initialize
async function init() {
  try {
    updateCameraExposure();
    await loadAndSetupModel();
    setupUIControls();
    animate();
  } catch (error) {
    console.error("Failed to initialize:", error);
  }
}

// Start the application
init();
