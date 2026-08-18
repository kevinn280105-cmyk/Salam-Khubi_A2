/* ============================================================
   engine-interactions.js
   ROOMS WITHIN

   Handles:
   - Real immersive VR detection
   - Door interaction
   - Mac door interaction
   - Quest door interaction
   - REAL CRT television inside livingasset.glb
   - TV glow
   - TV static connection
   - Mac object grabbing
   - Quest object grabbing / throwing
============================================================ */


/* ============================================================
   REAL IMMERSIVE XR CHECK

   Mac fullscreen is NOT treated as Quest VR.
============================================================ */

function isImmersiveXRScene(scene) {
  return Boolean(
    scene &&
    scene.renderer &&
    scene.renderer.xr &&
    scene.renderer.xr.isPresenting
  );
}


/* ============================================================
   THREE.JS / A-FRAME HELPER

   Checks whether a raycast object belongs to a particular
   A-Frame entity's GLB/model.
============================================================ */

function objectBelongsToEntity(hitObject, entity) {
  if (!hitObject || !entity) {
    return false;
  }

  const root = entity.getObject3D('mesh');

  if (!root) {
    return false;
  }

  let current = hitObject;

  while (current) {
    if (current === root) {
      return true;
    }

    current = current.parent;
  }

  return false;
}


/* ============================================================
   ADD SELECTOR TO EXISTING RAYCASTER

   This allows TV interaction to add .tv-interactable without
   rewriting the raycaster settings from index.html.
============================================================ */

function appendRaycasterObjectSelector(entity, selector) {
  if (!entity || !selector) {
    return;
  }

  const rayData = entity.getAttribute('raycaster') || {};
  const current = String(rayData.objects || '').trim();

  const selectors = current
    ? current
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  if (!selectors.includes(selector)) {
    selectors.push(selector);
  }

  entity.setAttribute(
    'raycaster',
    'objects',
    selectors.join(', ')
  );

  const raycaster = entity.components.raycaster;

  if (raycaster && raycaster.refreshObjects) {
    raycaster.refreshObjects();
  }
}


/* ============================================================
   MATERIAL SLOT HIT BY RAYCAST

   Some GLB meshes use multiple materials.
============================================================ */

function getIntersectionMaterialIndex(intersection) {
  if (
    intersection &&
    intersection.face &&
    typeof intersection.face.materialIndex === 'number'
  ) {
    return intersection.face.materialIndex;
  }

  return 0;
}


/* ============================================================
   DOOR SYSTEM
============================================================ */

AFRAME.registerComponent('door-hinge', {
  schema: {
    openAngle: {
      default: 100
    },

    hingeSide: {
      default: 'left',
      oneOf: ['left', 'right']
    },

    direction: {
      default: 1
    },

    duration: {
      default: 650
    }
  },


  init: function () {
    this.root = null;
    this.parts = [];
    this.partStates = new Map();
    this.lastActivation = 0;
    this.lastActiveState = null;
    this.closeTarget = null;

    this.el.addEventListener(
      'model-loaded',
      () => {
        this.prepareDoorParts();
        this.createCloseTarget();
      }
    );

    this.el.addEventListener(
      'activate-object',
      (event) => {
        const hitObject =
          event.detail && event.detail.object
            ? event.detail.object
            : null;

        this.activatePart(hitObject);
      }
    );

    this.el.addEventListener(
      'click',
      (event) => {
        if (isImmersiveXRScene(this.el.sceneEl)) {
          return;
        }

        if (event && event.stopPropagation) {
          event.stopPropagation();
        }

        const hitObject =
          event &&
          event.detail &&
          event.detail.intersection
            ? event.detail.intersection.object
            : null;

        if (
          hitObject &&
          this.activatePart(hitObject)
        ) {
          return;
        }

        this.closeOpenDoor();
      }
    );
  },


  hasMeshDescendant: function (object) {
    let found = false;

    object.traverse((node) => {
      if (node.isMesh) {
        found = true;
      }
    });

    return found;
  },


  prepareDoorParts: function () {
    this.root = this.el.getObject3D('mesh');

    if (!this.root) {
      return;
    }

    let container = this.root;

    while (true) {
      const meaningfulChildren =
        container.children.filter(
          (child) => this.hasMeshDescendant(child)
        );

      if (
        meaningfulChildren.length !== 1 ||
        meaningfulChildren[0].isMesh
      ) {
        break;
      }

      container = meaningfulChildren[0];
    }

    this.parts = container.children.filter(
      (child) => this.hasMeshDescendant(child)
    );

    if (!this.parts.length) {
      this.parts = [container];
    }

    console.log(
      `Door contains ${this.parts.length} selectable part(s).`
    );
  },


  createCloseTarget: function () {
    if (this.closeTarget || !this.root) {
      return;
    }

    this.root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.root);

    if (box.isEmpty()) {
      return;
    }

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    box.getSize(size);
    box.getCenter(center);

    const target = document.createElement('a-box');

    target.setAttribute('id', 'doorCloseTarget');

    target.setAttribute(
      'position',
      `${center.x} ${center.y} ${center.z}`
    );

    target.setAttribute(
      'width',
      Math.max(size.x * 0.28, 0.18)
    );

    target.setAttribute(
      'height',
      Math.max(size.y * 0.30, 0.42)
    );

    target.setAttribute(
      'depth',
      Math.max(size.z * 0.28, 0.12)
    );

    target.setAttribute(
      'material',
      `
        opacity: 0;
        transparent: true;
        depthWrite: false;
        side: double
      `
    );

    target.setAttribute('visible', false);

    target.addEventListener(
      'click',
      (event) => {
        if (isImmersiveXRScene(this.el.sceneEl)) {
          return;
        }

        if (event && event.stopPropagation) {
          event.stopPropagation();
        }

        this.closeOpenDoor();
      }
    );

    this.el.sceneEl.appendChild(target);

    this.closeTarget = target;

    this.updateCloseTarget();
  },


  activateDefaultPart: function () {
    if (!this.parts.length) {
      return false;
    }

    return this.activatePart(this.parts[0]);
  },


  findPartFromHit: function (hitObject) {
    let current = hitObject;

    while (current) {
      if (
        current.userData &&
        current.userData.doorPartState
      ) {
        return current.userData.doorPartState.part;
      }

      if (this.parts.includes(current)) {
        return current;
      }

      if (current === this.root) {
        break;
      }

      current = current.parent;
    }

    return this.parts.length === 1
      ? this.parts[0]
      : null;
  },


  getLocalBoundingBox: function (part) {
    const box = new THREE.Box3();
    box.makeEmpty();

    this.el.object3D.updateMatrixWorld(true);
    part.updateMatrixWorld(true);

    const inverseEntityWorld =
      new THREE.Matrix4()
        .copy(this.el.object3D.matrixWorld)
        .invert();

    part.traverse((node) => {
      if (!node.isMesh || !node.geometry) {
        return;
      }

      if (!node.geometry.boundingBox) {
        node.geometry.computeBoundingBox();
      }

      if (!node.geometry.boundingBox) {
        return;
      }

      const nodeToEntity =
        new THREE.Matrix4().multiplyMatrices(
          inverseEntityWorld,
          node.matrixWorld
        );

      const nodeBox =
        node.geometry.boundingBox
          .clone()
          .applyMatrix4(nodeToEntity);

      box.union(nodeBox);
    });

    return box;
  },


  createState: function (part) {
    if (this.partStates.has(part)) {
      return this.partStates.get(part);
    }

    const box = this.getLocalBoundingBox(part);

    if (box.isEmpty()) {
      return null;
    }

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    box.getSize(size);
    box.getCenter(center);

    const widthRunsAlongX = size.x >= size.z;
    const hingePosition = center.clone();

    if (widthRunsAlongX) {
      hingePosition.x =
        this.data.hingeSide === 'left'
          ? box.min.x
          : box.max.x;
    } else {
      hingePosition.z =
        this.data.hingeSide === 'left'
          ? box.min.z
          : box.max.z;
    }

    const pivot = new THREE.Group();

    pivot.name = 'individual-door-hinge';
    pivot.position.copy(hingePosition);

    this.el.object3D.add(pivot);

    pivot.attach(part);

    const state = {
      part: part,
      pivot: pivot,
      isOpen: false,
      currentAngle: 0,
      startAngle: 0,
      targetAngle: 0,
      animationTime: 0,
      isAnimating: false
    };

    part.userData.doorPartState = state;

    this.partStates.set(part, state);

    return state;
  },


  startDoorAnimation: function (state, shouldOpen) {
    state.isOpen = shouldOpen;
    state.startAngle = state.currentAngle;

    const targetDegrees = shouldOpen
      ? this.data.openAngle * this.data.direction
      : 0;

    state.targetAngle =
      THREE.MathUtils.degToRad(targetDegrees);

    state.animationTime = 0;
    state.isAnimating = true;

    this.updateCloseTarget();
  },


  activatePart: function (hitObject) {
    const now = performance.now();

    if (now - this.lastActivation < 250) {
      return false;
    }

    const part = this.findPartFromHit(hitObject);

    if (!part) {
      return false;
    }

    const state = this.createState(part);

    if (!state) {
      return false;
    }

    this.lastActivation = now;
    this.lastActiveState = state;

    this.startDoorAnimation(
      state,
      !state.isOpen
    );

    return true;
  },


  getOpenState: function () {
    if (
      this.lastActiveState &&
      this.lastActiveState.isOpen
    ) {
      return this.lastActiveState;
    }

    let openState = null;

    this.partStates.forEach((state) => {
      if (!openState && state.isOpen) {
        openState = state;
      }
    });

    return openState;
  },


  closeOpenDoor: function () {
    const state = this.getOpenState();

    if (!state) {
      return false;
    }

    const now = performance.now();

    if (now - this.lastActivation < 250) {
      return false;
    }

    this.lastActivation = now;
    this.lastActiveState = state;

    this.startDoorAnimation(state, false);

    return true;
  },


  toggleLastDoor: function () {
    const state = this.lastActiveState;

    if (!state) {
      return false;
    }

    const now = performance.now();

    if (now - this.lastActivation < 250) {
      return false;
    }

    this.lastActivation = now;

    this.startDoorAnimation(
      state,
      !state.isOpen
    );

    return true;
  },


  updateCloseTarget: function () {
    if (!this.closeTarget) {
      return;
    }

    this.closeTarget.setAttribute(
      'visible',
      Boolean(this.getOpenState())
    );
  },


  easeInOut: function (value) {
    return value < 0.5
      ? 2 * value * value
      : 1 - Math.pow(-2 * value + 2, 2) / 2;
  },


  tick: function (time, deltaTime) {
    if (!deltaTime) {
      return;
    }

    this.partStates.forEach((state) => {
      if (!state.isAnimating) {
        return;
      }

      state.animationTime += deltaTime;

      const progress = Math.min(
        state.animationTime / this.data.duration,
        1
      );

      const eased = this.easeInOut(progress);

      state.currentAngle =
        THREE.MathUtils.lerp(
          state.startAngle,
          state.targetAngle,
          eased
        );

      state.pivot.rotation.y = state.currentAngle;

      if (progress >= 1) {
        state.currentAngle = state.targetAngle;
        state.pivot.rotation.y = state.targetAngle;
        state.isAnimating = false;
      }
    });
  }
});


/* ============================================================
   QUEST DOOR INTERACTION
============================================================ */

AFRAME.registerComponent('vr-door-interactor', {
  schema: {
    pressThreshold: {
      default: 0.65
    },

    releaseThreshold: {
      default: 0.2
    }
  },


  init: function () {
    this.triggerHeld = false;
    this.lastTriggerTime = 0;

    this.pressTrigger = this.pressTrigger.bind(this);
    this.releaseTrigger = this.releaseTrigger.bind(this);
    this.onTriggerChanged = this.onTriggerChanged.bind(this);

    this.el.addEventListener(
      'triggerdown',
      this.pressTrigger
    );

    this.el.addEventListener(
      'triggerup',
      this.releaseTrigger
    );

    this.el.addEventListener(
      'triggerchanged',
      this.onTriggerChanged
    );

    this.el.addEventListener(
      'controllerdisconnected',
      this.releaseTrigger
    );
  },


  pressTrigger: function (event) {
    if (this.triggerHeld) {
      return;
    }

    if (event && event.stopPropagation) {
      event.stopPropagation();
    }

    const now = performance.now();

    if (now - this.lastTriggerTime < 250) {
      return;
    }

    this.triggerHeld = true;
    this.lastTriggerTime = now;

    this.useDoor();
  },


  releaseTrigger: function () {
    this.triggerHeld = false;
  },


  onTriggerChanged: function (event) {
    const value =
      event &&
      event.detail &&
      typeof event.detail.value === 'number'
        ? event.detail.value
        : null;

    if (value === null) {
      return;
    }

    if (
      value >= this.data.pressThreshold &&
      !this.triggerHeld
    ) {
      this.pressTrigger();
    } else if (
      value <= this.data.releaseThreshold
    ) {
      this.releaseTrigger();
    }
  },


  useDoor: function () {
    const raycaster = this.el.components.raycaster;
    const door = document.querySelector('#door');
    const closeTarget =
      document.querySelector('#doorCloseTarget');

    if (!raycaster || !door) {
      return;
    }

    const doorComponent =
      door.components['door-hinge'];

    if (!doorComponent) {
      return;
    }

    if (raycaster.refreshObjects) {
      raycaster.refreshObjects();
    }

    const intersections = raycaster.intersections || [];
    const closest = intersections.length
      ? intersections[0]
      : null;

    if (!closest) {
      return;
    }

    if (
      closeTarget &&
      objectBelongsToEntity(
        closest.object,
        closeTarget
      )
    ) {
      doorComponent.closeOpenDoor();
      return;
    }

    if (
      !objectBelongsToEntity(
        closest.object,
        door
      )
    ) {
      return;
    }

    if (
      doorComponent.activatePart(
        closest.object
      )
    ) {
      return;
    }

    doorComponent.activateDefaultPart();
  }
});


/* ============================================================
   REAL CRT TV

   NO fake plane.

   This component attaches to #living.
============================================================ */

AFRAME.registerComponent('embedded-tv', {
  schema: {
    glowColor: {
      default: '#d8efff'
    },

    screenColor: {
      default: '#a9bdc8'
    },

    lightColor: {
      default: '#c7e7ff'
    },

    lightIntensity: {
      default: 2.0
    },

    lightDistance: {
      default: 3
    },

    flickerMin: {
      default: 1.55
    },

    flickerMax: {
      default: 2.35
    },

    flickerInterval: {
      default: 85
    }
  },


  init: function () {
    this.root = null;
    this.isOn = false;

    this.screenMesh = null;
    this.screenMaterial = null;
    this.screenMaterialIndex = 0;

    this.originalColor = null;
    this.originalEmissive = null;
    this.originalEmissiveIntensity = 1;

    this.glowLight = null;
    this.lastFlickerTime = 0;

    this.onDesktopClick =
      this.onDesktopClick.bind(this);

    this.onModelLoaded =
      this.onModelLoaded.bind(this);

    this.el.addEventListener(
      'click',
      this.onDesktopClick
    );

    this.el.addEventListener(
      'model-loaded',
      this.onModelLoaded
    );

    if (this.el.getObject3D('mesh')) {
      this.onModelLoaded();
    }
  },


  onModelLoaded: function () {
    this.root = this.el.getObject3D('mesh');

    if (!this.root) {
      return;
    }

    this.tryNamedScreenAutoBind();
  },


  tryNamedScreenAutoBind: function () {
    if (this.screenMaterial || !this.root) {
      return false;
    }

    const keywords = [
      'tvscreen',
      'tv_screen',
      'televisionscreen',
      'television_screen',
      'crtscreen',
      'crt_screen',
      'screen',
      'display'
    ];

    let found = null;

    this.root.traverse((node) => {
      if (
        found ||
        !node.isMesh ||
        !node.material
      ) {
        return;
      }

      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];

      materials.forEach((material, index) => {
        if (found || !material) {
          return;
        }

        const materialName =
          String(material.name || '')
            .toLowerCase()
            .replace(/\s+/g, '');

        const meshName =
          String(node.name || '')
            .toLowerCase()
            .replace(/\s+/g, '');

        const combined = `${meshName} ${materialName}`;

        const matching = keywords.some((keyword) =>
          combined.includes(
            keyword.replace(/\s+/g, '')
          )
        );

        if (matching) {
          found = {
            mesh: node,
            materialIndex: index
          };
        }
      });
    });

    if (!found) {
      console.log(
        'TV: no named screen found. ' +
        'Click the real CRT glass once and it will bind automatically.'
      );

      return false;
    }

    this.bindSurface(
      found.mesh,
      found.materialIndex,
      null
    );

    console.log(
      'TV: named CRT screen found automatically.'
    );

    return true;
  },


  onDesktopClick: function (event) {
    if (isImmersiveXRScene(this.el.sceneEl)) {
      return;
    }

    const intersection =
      event &&
      event.detail &&
      event.detail.intersection
        ? event.detail.intersection
        : null;

    if (!intersection) {
      return;
    }

    if (
      !objectBelongsToEntity(
        intersection.object,
        this.el
      )
    ) {
      return;
    }

    if (event.stopPropagation) {
      event.stopPropagation();
    }

    this.toggleFromIntersection(intersection);
  },


  intersectionMatchesScreen: function (intersection) {
    if (!intersection || !this.screenMesh) {
      return false;
    }

    if (intersection.object !== this.screenMesh) {
      return false;
    }

    const materialIndex =
      getIntersectionMaterialIndex(intersection);

    return materialIndex === this.screenMaterialIndex;
  },


  toggleFromIntersection: function (intersection) {
    if (
      !intersection ||
      !intersection.object ||
      !intersection.object.isMesh
    ) {
      return false;
    }

    /* --------------------------------------------------
       FIRST CLICK

       Remember exactly which GLB material was hit.
    -------------------------------------------------- */

    if (!this.screenMaterial) {
      const materialIndex =
        getIntersectionMaterialIndex(intersection);

      const bound = this.bindSurface(
        intersection.object,
        materialIndex,
        intersection
      );

      if (!bound) {
        return false;
      }

      this.setState(true);
      return true;
    }

    /* --------------------------------------------------
       ALREADY BOUND

       Other furniture does nothing.
    -------------------------------------------------- */

    if (!this.intersectionMatchesScreen(intersection)) {
      return false;
    }

    /*
      Recalculate the light position and forward direction from
      the REAL CRT surface each time the screen is clicked.

      This keeps the old soft point-light look, but moves the
      source slightly in front of the CRT instead of beside it.
    */

    this.createGlowLight(
      intersection.point,
      intersection.object,
      intersection
    );

    this.toggle();

    return true;
  },


  getMaterialAt: function (mesh, materialIndex) {
    if (!mesh || !mesh.material) {
      return null;
    }

    if (Array.isArray(mesh.material)) {
      return (
        mesh.material[materialIndex] ||
        mesh.material[0] ||
        null
      );
    }

    return mesh.material;
  },


  cloneMaterialSlot: function (mesh, materialIndex) {
    const original = this.getMaterialAt(
      mesh,
      materialIndex
    );

    if (!original || !original.clone) {
      return null;
    }

    const cloned = original.clone();

    if (Array.isArray(mesh.material)) {
      const materials = mesh.material.slice();
      materials[materialIndex] = cloned;
      mesh.material = materials;
    } else {
      mesh.material = cloned;
    }

    return cloned;
  },


  bindSurface: function (
    mesh,
    materialIndex,
    intersection
  ) {
    if (!mesh || !mesh.isMesh) {
      return false;
    }

    const material = this.cloneMaterialSlot(
      mesh,
      materialIndex
    );

    if (!material) {
      console.warn(
        'TV: selected surface has no usable material.'
      );

      return false;
    }

    this.screenMesh = mesh;
    this.screenMaterialIndex = materialIndex;
    this.screenMaterial = material;

    if (material.color && material.color.clone) {
      this.originalColor = material.color.clone();
    }

    if (
      material.emissive &&
      material.emissive.clone
    ) {
      this.originalEmissive =
        material.emissive.clone();
    }

    if (
      typeof material.emissiveIntensity === 'number'
    ) {
      this.originalEmissiveIntensity =
        material.emissiveIntensity;
    }

    mesh.userData.roomsTVScreen = true;

    const worldPoint =
      intersection && intersection.point
        ? intersection.point.clone()
        : this.getMeshWorldCenter(mesh);

    /*
      IMPORTANT FIX:
      use the actual CRT surface and its normal so the point light
      is placed out in front of the screen.
    */

    this.createGlowLight(
      worldPoint,
      mesh,
      intersection
    );

    if (
      worldPoint &&
      window.setRoomsTVPosition
    ) {
      window.setRoomsTVPosition(worldPoint);
    }

    console.log(
      'TV SCREEN BOUND:',
      '\nMesh:',
      mesh.name || '(unnamed mesh)',
      '\nMaterial:',
      material.name || '(unnamed material)',
      '\nMaterial slot:',
      materialIndex
    );

    if (!Array.isArray(mesh.material)) {
      console.log(
        'TV note: this clicked mesh uses one material. ' +
        'If the whole television glows instead of only the glass, ' +
        'the CRT glass needs its own material in Blender.'
      );
    }

    return true;
  },


  getMeshWorldCenter: function (mesh) {
    if (!mesh) {
      return null;
    }

    mesh.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(mesh);

    if (box.isEmpty()) {
      return null;
    }

    return box.getCenter(new THREE.Vector3());
  },


  /* ======================================================
     TV GLOW - FIXED

     Keeps the SOFT POINT-LIGHT look that worked better.

     The point light is moved about 20 cm OUT IN FRONT of
     the actual CRT glass, based on the clicked triangle's
     surface normal.

     This prevents the strongest glow from appearing at the
     side of / underneath the TV cabinet.
  ====================================================== */

  createGlowLight: function (
    worldPoint,
    mesh,
    intersection
  ) {
    if (!worldPoint) {
      return;
    }

    const forward = new THREE.Vector3();

    /* --------------------------------------------------
       FIND WHICH WAY THE CRT GLASS FACES
    -------------------------------------------------- */

    if (
      intersection &&
      intersection.face &&
      mesh
    ) {
      const normalMatrix =
        new THREE.Matrix3().getNormalMatrix(
          mesh.matrixWorld
        );

      forward
        .copy(intersection.face.normal)
        .applyMatrix3(normalMatrix)
        .normalize();

      /*
        Make sure the normal points OUT into the room,
        toward the player, rather than backward through
        the television.
      */

      const cameraEl = document.querySelector('#cam');

      if (cameraEl) {
        const cameraWorld = new THREE.Vector3();

        cameraEl.object3D.getWorldPosition(
          cameraWorld
        );

        const towardPlayer =
          cameraWorld
            .clone()
            .sub(worldPoint)
            .normalize();

        if (forward.dot(towardPlayer) < 0) {
          forward.multiplyScalar(-1);
        }
      }
    } else {
      /*
        Fallback when the screen was automatically discovered
        by its Blender mesh/material name.
      */

      const cameraEl = document.querySelector('#cam');

      if (cameraEl) {
        const cameraWorld = new THREE.Vector3();

        cameraEl.object3D.getWorldPosition(
          cameraWorld
        );

        forward
          .subVectors(cameraWorld, worldPoint)
          .normalize();
      } else {
        forward.set(0, 0, 1);
      }
    }

    /* --------------------------------------------------
       MOVE SOURCE OUT IN FRONT OF THE CRT
    -------------------------------------------------- */

    const lightWorld =
      worldPoint
        .clone()
        .addScaledVector(
          forward,
          0.20
        );

    /*
      Tiny upward shift prevents the cabinet surface directly
      below the CRT from becoming the brightest object.
    */

    lightWorld.y += 0.025;

    /* --------------------------------------------------
       CREATE SOFT POINT LIGHT
    -------------------------------------------------- */

    if (!this.glowLight) {
      const light = document.createElement('a-entity');

      light.setAttribute('id', 'tvGlowLight');

      light.setAttribute(
        'light',
        `
          type: point;
          color: ${this.data.lightColor};
          intensity: 0;
          distance: ${this.data.lightDistance};
          decay: 2;
          castShadow: false
        `
      );

      this.el.appendChild(light);
      this.glowLight = light;
    }

    /* --------------------------------------------------
       WORLD → livingasset LOCAL SPACE
    -------------------------------------------------- */

    this.el.object3D.updateMatrixWorld(true);

    const localLight =
      this.el.object3D.worldToLocal(
        lightWorld.clone()
      );

    this.glowLight.object3D.position.copy(
      localLight
    );

    console.log(
      'TV point light moved in front of CRT:',
      lightWorld
        .toArray()
        .map((value) => value.toFixed(2))
    );
  },


  toggle: function () {
    this.setState(!this.isOn);
  },


  setState: function (shouldBeOn) {
    if (!this.screenMaterial) {
      return false;
    }

    this.isOn = Boolean(shouldBeOn);

    this.applyVisualState();

    if (window.setRoomsTVState) {
      window.setRoomsTVState(this.isOn);
    }

    this.el.emit(
      'tv-state-changed',
      {
        isOn: this.isOn
      },
      false
    );

    console.log(
      this.isOn
        ? 'TV turned ON.'
        : 'TV turned OFF.'
    );

    return true;
  },


  applyVisualState: function () {
    const material = this.screenMaterial;

    if (!material) {
      return;
    }

    if (this.isOn) {
      if (
        material.emissive &&
        material.emissive.set
      ) {
        material.emissive.set(
          this.data.glowColor
        );

        if (
          typeof material.emissiveIntensity === 'number'
        ) {
          material.emissiveIntensity = 2.0;
        }
      }

      if (
        material.color &&
        material.color.set
      ) {
        material.color.set(
          this.data.screenColor
        );
      }

      if (this.glowLight) {
        this.glowLight.setAttribute(
          'light',
          'intensity',
          this.data.lightIntensity
        );
      }
    } else {
      if (
        this.originalColor &&
        material.color &&
        material.color.copy
      ) {
        material.color.copy(
          this.originalColor
        );
      }

      if (
        this.originalEmissive &&
        material.emissive &&
        material.emissive.copy
      ) {
        material.emissive.copy(
          this.originalEmissive
        );
      }

      if (
        typeof material.emissiveIntensity === 'number'
      ) {
        material.emissiveIntensity =
          this.originalEmissiveIntensity;
      }

      if (this.glowLight) {
        this.glowLight.setAttribute(
          'light',
          'intensity',
          0
        );
      }
    }

    material.needsUpdate = true;
  },


  tick: function (time) {
    if (!this.isOn || !this.screenMaterial) {
      return;
    }

    if (
      time - this.lastFlickerTime <
      this.data.flickerInterval
    ) {
      return;
    }

    this.lastFlickerTime = time;

    const brightness =
      this.data.flickerMin +
      Math.random() *
      (
        this.data.flickerMax -
        this.data.flickerMin
      );

    const material = this.screenMaterial;

    if (
      material.emissive &&
      typeof material.emissiveIntensity === 'number'
    ) {
      material.emissiveIntensity = brightness;
    }

    if (this.glowLight) {
      const roomBrightness =
        this.data.lightIntensity *
        (
          0.78 +
          Math.random() * 0.32
        );

      this.glowLight.setAttribute(
        'light',
        'intensity',
        roomBrightness
      );
    }
  },


  remove: function () {
    this.el.removeEventListener(
      'click',
      this.onDesktopClick
    );

    this.el.removeEventListener(
      'model-loaded',
      this.onModelLoaded
    );
  }
});


/* ============================================================
   QUEST REAL TV INTERACTION
============================================================ */

AFRAME.registerComponent('vr-tv-interactor', {
  schema: {
    pressThreshold: {
      default: 0.65
    },

    releaseThreshold: {
      default: 0.2
    }
  },


  init: function () {
    this.triggerHeld = false;

    this.pressTrigger = this.pressTrigger.bind(this);
    this.releaseTrigger = this.releaseTrigger.bind(this);
    this.onTriggerChanged = this.onTriggerChanged.bind(this);

    this.el.addEventListener(
      'triggerdown',
      this.pressTrigger
    );

    this.el.addEventListener(
      'triggerup',
      this.releaseTrigger
    );

    this.el.addEventListener(
      'triggerchanged',
      this.onTriggerChanged
    );

    this.el.addEventListener(
      'controllerdisconnected',
      this.releaseTrigger
    );
  },


  pressTrigger: function () {
    if (this.triggerHeld) {
      return;
    }

    this.triggerHeld = true;
    this.useTV();
  },


  releaseTrigger: function () {
    this.triggerHeld = false;
  },


  onTriggerChanged: function (event) {
    const value =
      event &&
      event.detail &&
      typeof event.detail.value === 'number'
        ? event.detail.value
        : null;

    if (value === null) {
      return;
    }

    if (
      value >= this.data.pressThreshold &&
      !this.triggerHeld
    ) {
      this.pressTrigger();
    } else if (
      value <= this.data.releaseThreshold
    ) {
      this.releaseTrigger();
    }
  },


  useTV: function () {
    const living = document.querySelector('#living');

    if (!living) {
      return;
    }

    const television =
      living.components['embedded-tv'];

    const raycaster = this.el.components.raycaster;

    if (!television || !raycaster) {
      return;
    }

    if (raycaster.refreshObjects) {
      raycaster.refreshObjects();
    }

    const intersections = raycaster.intersections || [];

    if (!intersections.length) {
      return;
    }

    const closest = intersections[0];

    if (
      !objectBelongsToEntity(
        closest.object,
        living
      )
    ) {
      return;
    }

    television.toggleFromIntersection(closest);
  }
});


/* ============================================================
   AUTOMATIC REAL TV SETUP
============================================================ */

function setupRoomsTV() {
  const living = document.querySelector('#living');
  const cursor = document.querySelector('a-cursor');
  const rightHand = document.querySelector('#rightHand');

  if (!living) {
    return;
  }

  living.classList.add('tv-interactable');

  if (!living.hasAttribute('embedded-tv')) {
    living.setAttribute('embedded-tv', '');
  }

  appendRaycasterObjectSelector(
    cursor,
    '.tv-interactable'
  );

  appendRaycasterObjectSelector(
    rightHand,
    '.tv-interactable'
  );

  if (
    rightHand &&
    !rightHand.hasAttribute('vr-tv-interactor')
  ) {
    rightHand.setAttribute(
      'vr-tv-interactor',
      ''
    );
  }

  console.log(
    'Real embedded CRT TV interaction ready.'
  );
}


window.addEventListener(
  'DOMContentLoaded',
  () => {
    const scene = document.querySelector('a-scene');

    if (!scene) {
      return;
    }

    if (scene.hasLoaded) {
      setupRoomsTV();
    } else {
      scene.addEventListener(
        'loaded',
        setupRoomsTV,
        {
          once: true
        }
      );
    }
  }
);


/* ============================================================
   NATURAL GRABBABLE OBJECT
============================================================ */

AFRAME.registerComponent('natural-grabbable', {
  schema: {
    gravity: {
      default: -9.8
    },

    floorY: {
      default: 0.015
    },

    throwMultiplier: {
      default: 1.0
    },

    maxThrowSpeed: {
      default: 6
    }
  },


  init: function () {
    this.heldBy = null;
    this.velocity = new THREE.Vector3();
    this.isMoving = false;
    this.lastSurfaceCheck = 0;
    this.dropRay = new THREE.Raycaster();
    this.dropRay.far = 2.5;
    this.cachedRoomMeshes = [];
    this.roomMeshCacheTime = 0;

    this.el.addEventListener(
      'click',
      () => {
        if (isImmersiveXRScene(this.el.sceneEl)) {
          return;
        }

        const desktopHold =
          document.querySelector('#desktopHold');

        if (!desktopHold) {
          return;
        }

        if (this.heldBy) {
          this.release(new THREE.Vector3());
        } else {
          this.grab(desktopHold);
        }
      }
    );
  },


  getWorldBox: function () {
    const model =
      this.el.getObject3D('mesh') ||
      this.el.object3D;

    model.updateMatrixWorld(true);

    return new THREE.Box3().setFromObject(model);
  },


  distanceToPoint: function (worldPoint) {
    const box = this.getWorldBox();

    if (box.isEmpty()) {
      return Infinity;
    }

    const closest =
      worldPoint
        .clone()
        .clamp(box.min, box.max);

    return closest.distanceTo(worldPoint);
  },


  reparentPreserveWorld: function (newParentObject3D) {
    newParentObject3D.updateMatrixWorld(true);
    newParentObject3D.attach(this.el.object3D);
  },


  grab: function (handEntity) {
    if (this.heldBy) {
      return false;
    }

    this.isMoving = false;
    this.velocity.set(0, 0, 0);
    this.heldBy = handEntity;

    this.reparentPreserveWorld(
      handEntity.object3D
    );

    this.el.addState('grabbed');

    console.log(
      this.el.id,
      'grabbed by',
      handEntity.id
    );

    return true;
  },


  release: function (controllerVelocity) {
    if (!this.heldBy) {
      return;
    }

    const scene = this.el.sceneEl;

    this.reparentPreserveWorld(
      scene.object3D
    );

    this.heldBy = null;
    this.el.removeState('grabbed');

    this.velocity.copy(
      controllerVelocity ||
      new THREE.Vector3()
    );

    this.velocity.multiplyScalar(
      this.data.throwMultiplier
    );

    this.velocity.clampLength(
      0,
      this.data.maxThrowSpeed
    );

    if (this.velocity.length() < 0.22) {
      const settled =
        this.settleOnNearbySurface(0.45);

      this.isMoving = !settled;
    } else {
      this.isMoving = true;
    }
  },


  getRoomMeshes: function () {
    const now = performance.now();

    if (
      this.cachedRoomMeshes.length &&
      now - this.roomMeshCacheTime < 5000
    ) {
      return this.cachedRoomMeshes;
    }

    const meshes = [];

    this.el.sceneEl
      .querySelectorAll('.roompart')
      .forEach((entity) => {
        const root = entity.getObject3D('mesh');

        if (!root) {
          return;
        }

        root.updateMatrixWorld(true);

        root.traverse((node) => {
          if (node.isMesh) {
            meshes.push(node);
          }
        });
      });

    this.cachedRoomMeshes = meshes;
    this.roomMeshCacheTime = now;

    return this.cachedRoomMeshes;
  },


  settleOnNearbySurface: function (maximumDistance) {
    const roomMeshes = this.getRoomMeshes();

    if (!roomMeshes.length) {
      return false;
    }

    const box = this.getWorldBox();

    if (box.isEmpty()) {
      return false;
    }

    const center = new THREE.Vector3();
    box.getCenter(center);

    const origin = new THREE.Vector3(
      center.x,
      box.min.y + 0.08,
      center.z
    );

    this.dropRay.set(
      origin,
      new THREE.Vector3(0, -1, 0)
    );

    this.dropRay.far = maximumDistance + 0.08;

    const hit =
      this.dropRay.intersectObjects(
        roomMeshes,
        true
      )[0];

    if (!hit) {
      return false;
    }

    const gap = box.min.y - hit.point.y;

    if (
      gap < -0.03 ||
      gap > maximumDistance
    ) {
      return false;
    }

    this.el.object3D.position.y +=
      hit.point.y -
      box.min.y +
      0.012;

    this.velocity.set(0, 0, 0);

    return true;
  },


  tick: function (time, deltaTime) {
    if (
      this.heldBy ||
      !this.isMoving ||
      !deltaTime
    ) {
      return;
    }

    const dt = Math.min(
      deltaTime / 1000,
      0.04
    );

    this.velocity.y +=
      this.data.gravity * dt;

    this.el.object3D.position.addScaledVector(
      this.velocity,
      dt
    );

    const damping = Math.pow(
      0.985,
      dt * 60
    );

    this.velocity.x *= damping;
    this.velocity.z *= damping;

    this.el.object3D.updateMatrixWorld(true);

    const box = this.getWorldBox();

    if (!box.isEmpty()) {
      const floorPenetration =
        this.data.floorY - box.min.y;

      if (floorPenetration > 0) {
        this.el.object3D.position.y +=
          floorPenetration;

        if (
          Math.abs(this.velocity.y) > 0.8
        ) {
          this.velocity.y *= -0.12;
          this.velocity.x *= 0.72;
          this.velocity.z *= 0.72;
        } else {
          this.velocity.set(0, 0, 0);
          this.isMoving = false;
        }
      }
    }

    if (
      this.isMoving &&
      this.velocity.y <= 0 &&
      time - this.lastSurfaceCheck > 120
    ) {
      this.lastSurfaceCheck = time;

      if (
        this.settleOnNearbySurface(0.12)
      ) {
        this.isMoving = false;
      }
    }
  }
});


/* ============================================================
   QUEST NATURAL GRAB HAND
============================================================ */

AFRAME.registerComponent('natural-grab-hand', {
  schema: {
    radius: {
      default: 0.4
    },

    velocitySmoothing: {
      default: 0.35
    },

    gripThreshold: {
      default: 0.5
    }
  },


  init: function () {
    this.heldItem = null;
    this.previousPosition = new THREE.Vector3();
    this.currentPosition = new THREE.Vector3();
    this.smoothedVelocity = new THREE.Vector3();
    this.instantVelocity = new THREE.Vector3();
    this.hasPreviousPosition = false;
    this.gripHeld = false;
    this.analogGripHeld = false;

    this.beginGrip = this.beginGrip.bind(this);
    this.endGrip = this.endGrip.bind(this);
    this.onGripChanged = this.onGripChanged.bind(this);

    this.el.addEventListener(
      'gripdown',
      this.beginGrip
    );

    this.el.addEventListener(
      'squeezestart',
      this.beginGrip
    );

    this.el.addEventListener(
      'gripup',
      this.endGrip
    );

    this.el.addEventListener(
      'squeezeend',
      this.endGrip
    );

    this.el.addEventListener(
      'gripchanged',
      this.onGripChanged
    );

    this.el.addEventListener(
      'abuttondown',
      this.beginGrip
    );

    this.el.addEventListener(
      'abuttonup',
      this.endGrip
    );

    this.el.addEventListener(
      'xbuttondown',
      this.beginGrip
    );

    this.el.addEventListener(
      'xbuttonup',
      this.endGrip
    );

    this.el.addEventListener(
      'controllerdisconnected',
      this.endGrip
    );
  },


  onGripChanged: function (event) {
    const value =
      event &&
      event.detail &&
      typeof event.detail.value === 'number'
        ? event.detail.value
        : (
            event &&
            typeof event.detail === 'number'
              ? event.detail
              : null
          );

    if (value === null) {
      return;
    }

    const isPressed =
      value >= this.data.gripThreshold;

    if (
      isPressed &&
      !this.analogGripHeld
    ) {
      this.analogGripHeld = true;
      this.beginGrip();
    } else if (
      !isPressed &&
      this.analogGripHeld
    ) {
      this.analogGripHeld = false;
      this.endGrip();
    }
  },


  beginGrip: function () {
    if (this.gripHeld) {
      return;
    }

    this.gripHeld = true;
    this.grabNearest();
  },


  endGrip: function () {
    if (!this.gripHeld && !this.heldItem) {
      return;
    }

    this.gripHeld = false;
    this.releaseHeld();
  },


  findNearest: function () {
    const handPosition = new THREE.Vector3();

    this.el.object3D.getWorldPosition(
      handPosition
    );

    let nearest = null;
    let nearestEl = null;
    let nearestDistance = Infinity;

    this.el.sceneEl
      .querySelectorAll('[natural-grabbable]')
      .forEach((entity) => {
        const component =
          entity.components['natural-grabbable'];

        if (!component || component.heldBy) {
          return;
        }

        const distance =
          component.distanceToPoint(
            handPosition
          );

        if (distance < nearestDistance) {
          nearest = component;
          nearestEl = entity;
          nearestDistance = distance;
        }
      });

    return {
      nearest: nearest,
      nearestEl: nearestEl,
      nearestDistance: nearestDistance
    };
  },


  grabNearest: function () {
    if (this.heldItem) {
      return;
    }

    const {
      nearest,
      nearestEl,
      nearestDistance
    } = this.findNearest();

    if (
      !nearest ||
      nearestDistance > this.data.radius
    ) {
      console.log(
        this.el.id,
        'grip pressed, but no item was close enough. Nearest:',
        nearestEl ? nearestEl.id : 'none'
      );

      return;
    }

    if (nearest.grab(this.el)) {
      this.heldItem = nearest;
    }
  },


  releaseHeld: function () {
    if (!this.heldItem) {
      return;
    }

    const released = this.heldItem;
    this.heldItem = null;

    released.release(
      this.smoothedVelocity.clone()
    );
  },


  tick: function (time, deltaTime) {
    if (!deltaTime) {
      return;
    }

    this.el.object3D.getWorldPosition(
      this.currentPosition
    );

    if (!this.hasPreviousPosition) {
      this.previousPosition.copy(
        this.currentPosition
      );

      this.hasPreviousPosition = true;
      return;
    }

    const seconds = deltaTime / 1000;

    if (seconds > 0) {
      this.instantVelocity
        .subVectors(
          this.currentPosition,
          this.previousPosition
        )
        .divideScalar(seconds);

      this.smoothedVelocity.lerp(
        this.instantVelocity,
        this.data.velocitySmoothing
      );

      this.previousPosition.copy(
        this.currentPosition
      );
    }
  }
});