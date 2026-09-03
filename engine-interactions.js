/* ============================================================
   engine-interactions.js — ROOMS WITHIN
   FULL REPLACEMENT

   Standalone TV version:
   - Door opens/closes automatically by proximity.
   - Manual desktop / Quest door interaction still works.
   - #tv uses tv.glb and is the ONLY TV interaction target.
   - No #tvScreenHitbox and no TV guessing inside livingasset.glb.
   - TV glow + spatial audio use the standalone TV model position.
   - Teddy / incense style objects remain grabbable.
   - Quest grab-hand behavior remains enabled.
   - Pause / input lock is respected.
============================================================ */

/* ============================================================
   SHARED HELPERS
============================================================ */

function roomsGameplayInputLocked() {
  return Boolean(window.roomsInputLocked || window.roomsPaused);
}

function isImmersiveXRScene(scene) {
  return Boolean(
    scene &&
    scene.renderer &&
    scene.renderer.xr &&
    scene.renderer.xr.isPresenting
  );
}

function objectBelongsToEntity(hitObject, entity) {
  if (!hitObject || !entity) return false;

  const root = entity.getObject3D('mesh') || entity.object3D;
  if (!root) return false;

  let current = hitObject;

  while (current) {
    if (current === root) return true;
    current = current.parent;
  }

  return false;
}

function appendRaycasterObjectSelector(entity, selector) {
  if (!entity || !selector) return;

  const data =
    entity.getAttribute('raycaster') || {};

  const selectors =
    String(data.objects || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  if (!selectors.includes(selector)) {
    selectors.push(selector);
  }

  entity.setAttribute(
    'raycaster',
    'objects',
    selectors.join(', ')
  );

  const raycaster =
    entity.components.raycaster;

  if (
    raycaster &&
    raycaster.refreshObjects
  ) {
    raycaster.refreshObjects();
  }
}

function getIntersectionMaterialIndex(
  intersection
) {
  if (
    intersection &&
    intersection.face &&
    typeof intersection
      .face.materialIndex ===
      'number'
  ) {
    return intersection
      .face.materialIndex;
  }

  return 0;
}

function getClosestRayIntersection(
  raycaster
) {
  if (!raycaster) {
    return null;
  }

  if (
    raycaster.refreshObjects
  ) {
    raycaster.refreshObjects();
  }

  const intersections =
    raycaster.intersections || [];

  return intersections.length
    ? intersections[0]
    : null;
}


/* ============================================================
   DOOR HINGE
============================================================ */

AFRAME.registerComponent(
  'door-hinge',
  {
    schema: {
      openAngle: {
        default: 100
      },

      hingeSide: {
        default: 'left',
        oneOf: [
          'left',
          'right'
        ]
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

      this.partStates =
        new Map();

      this.lastActivation = 0;

      this.onModelLoaded =
        this.onModelLoaded.bind(this);

      this.onActivateObject =
        this.onActivateObject.bind(
          this
        );

      this.onDesktopClick =
        this.onDesktopClick.bind(
          this
        );

      this.el.addEventListener(
        'model-loaded',
        this.onModelLoaded
      );

      this.el.addEventListener(
        'activate-object',
        this.onActivateObject
      );

      this.el.addEventListener(
        'click',
        this.onDesktopClick
      );

      if (
        this.el.getObject3D(
          'mesh'
        )
      ) {
        this.onModelLoaded();
      }
    },


    hasMeshDescendant:
      function (object) {
        let found = false;

        object.traverse(
          (node) => {
            if (node.isMesh) {
              found = true;
            }
          }
        );

        return found;
      },


    onModelLoaded:
      function () {
        this.root =
          this.el.getObject3D(
            'mesh'
          );

        if (!this.root) {
          return;
        }

        let container =
          this.root;

        while (true) {
          const children =
            container.children
              .filter(
                (child) =>
                  this.hasMeshDescendant(
                    child
                  )
              );

          if (
            children.length !== 1 ||
            children[0].isMesh
          ) {
            break;
          }

          container =
            children[0];
        }

        this.parts =
          container.children
            .filter(
              (child) =>
                this.hasMeshDescendant(
                  child
                )
            );

        if (
          !this.parts.length
        ) {
          this.parts = [
            container
          ];
        }

        /*
          Tell the proximity component that the GLB has finished preparing.

          This makes the automatic door reliable even when A-Frame attaches
          auto-door-proximity before the model-loaded event finishes.
        */

        this.el.emit(
          'rooms-door-ready',

          {
            parts:
              this.parts.length
          },

          false
        );

        console.log(
          `Door ready with ${this.parts.length} movable part(s).`
        );
      },


    getLocalBoundingBox:
      function (part) {
        const box =
          new THREE.Box3();

        box.makeEmpty();

        this.el.object3D
          .updateMatrixWorld(
            true
          );

        part.updateMatrixWorld(
          true
        );

        const inverseEntityWorld =
          new THREE.Matrix4()
            .copy(
              this.el.object3D
                .matrixWorld
            )
            .invert();

        part.traverse(
          (node) => {
            if (
              !node.isMesh ||
              !node.geometry
            ) {
              return;
            }

            if (
              !node.geometry
                .boundingBox
            ) {
              node.geometry
                .computeBoundingBox();
            }

            if (
              !node.geometry
                .boundingBox
            ) {
              return;
            }

            const matrix =
              new THREE.Matrix4()
                .multiplyMatrices(
                  inverseEntityWorld,
                  node.matrixWorld
                );

            box.union(
              node.geometry
                .boundingBox
                .clone()
                .applyMatrix4(
                  matrix
                )
            );
          }
        );

        return box;
      },


    findPartFromHit:
      function (
        hitObject
      ) {
        if (!hitObject) {
          return (
            this.parts.length ===
              1
              ? this.parts[0]
              : null
          );
        }

        let current =
          hitObject;

        while (current) {
          if (
            current.userData &&
            current.userData
              .roomsDoorState
          ) {
            return current
              .userData
              .roomsDoorState
              .part;
          }

          if (
            this.parts.includes(
              current
            )
          ) {
            return current;
          }

          if (
            current ===
            this.root
          ) {
            break;
          }

          current =
            current.parent;
        }

        return (
          this.parts.length ===
            1
            ? this.parts[0]
            : null
        );
      },


    createState:
      function (part) {
        if (!part) {
          return null;
        }

        if (
          this.partStates.has(
            part
          )
        ) {
          return this.partStates
            .get(part);
        }

        const box =
          this.getLocalBoundingBox(
            part
          );

        if (box.isEmpty()) {
          return null;
        }

        const size =
          new THREE.Vector3();

        const center =
          new THREE.Vector3();

        box.getSize(size);

        box.getCenter(
          center
        );

        const widthAlongX =
          size.x >= size.z;

        const hinge =
          center.clone();

        if (widthAlongX) {
          hinge.x =
            this.data.hingeSide ===
            'left'
              ? box.min.x
              : box.max.x;
        } else {
          hinge.z =
            this.data.hingeSide ===
            'left'
              ? box.min.z
              : box.max.z;
        }

        const pivot =
          new THREE.Group();

        pivot.name =
          'rooms-door-hinge';

        pivot.position.copy(
          hinge
        );

        this.el.object3D
          .add(pivot);

        pivot.attach(
          part
        );

        const state = {
          part,
          pivot,

          isOpen:
            false,

          currentAngle:
            0,

          startAngle:
            0,

          targetAngle:
            0,

          elapsed:
            0,

          animating:
            false
        };

        part.userData
          .roomsDoorState =
          state;

        this.partStates.set(
          part,
          state
        );

        return state;
      },


    startDoorAnimation:
      function (
        state,
        open,
        automatic
      ) {
        if (!state) {
          return false;
        }

        const shouldOpen =
          Boolean(open);

        if (
          state.isOpen ===
            shouldOpen &&
          !state.animating
        ) {
          return false;
        }

        state.isOpen =
          shouldOpen;

        state.startAngle =
          state.currentAngle;

        state.targetAngle =
          THREE.MathUtils
            .degToRad(
              shouldOpen
                ? (
                    this.data
                      .openAngle *
                    this.data
                      .direction
                  )
                : 0
            );

        state.elapsed = 0;

        state.animating =
          true;

        this.el.emit(
          shouldOpen
            ? 'door-opened'
            : 'door-closed',

          {
            automatic:
              Boolean(
                automatic
              )
          },

          false
        );

        return true;
      },


    activatePart:
      function (
        hitObject
      ) {
        if (
          roomsGameplayInputLocked()
        ) {
          return false;
        }

        const now =
          performance.now();

        if (
          now -
            this.lastActivation <
          250
        ) {
          return false;
        }

        const part =
          this.findPartFromHit(
            hitObject
          );

        if (!part) {
          return false;
        }

        const state =
          this.createState(
            part
          );

        if (!state) {
          return false;
        }

        this.lastActivation =
          now;

        return this
          .startDoorAnimation(
            state,
            !state.isOpen,
            false
          );
      },


    activateDefaultPart:
      function () {
        if (
          !this.parts.length
        ) {
          return false;
        }

        return this
          .activatePart(
            this.parts[0]
          );
      },


    onActivateObject:
      function (event) {
        if (
          roomsGameplayInputLocked()
        ) {
          return;
        }

        const object =
          event.detail &&
          event.detail.object
            ? event.detail.object
            : null;

        this.activatePart(
          object
        );
      },


    onDesktopClick:
      function (event) {
        if (
          roomsGameplayInputLocked() ||
          isImmersiveXRScene(
            this.el.sceneEl
          )
        ) {
          return;
        }

        if (
          event &&
          event.stopPropagation
        ) {
          event.stopPropagation();
        }

        const object =
          event &&
          event.detail &&
          event.detail
            .intersection
            ? event.detail
                .intersection
                .object
            : null;

        this.activatePart(
          object
        );
      },


    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          roomsGameplayInputLocked() ||
          !deltaTime
        ) {
          return;
        }

        this.partStates
          .forEach(
            (state) => {
              if (
                !state.animating
              ) {
                return;
              }

              state.elapsed +=
                deltaTime;

              const progress =
                Math.min(
                  state.elapsed /
                    Math.max(
                      this.data
                        .duration,
                      1
                    ),

                  1
                );

              const eased =
                progress < 0.5
                  ? (
                      2 *
                      progress *
                      progress
                    )
                  : (
                      1 -
                      Math.pow(
                        -2 *
                          progress +
                          2,
                        2
                      ) /
                      2
                    );

              state.currentAngle =
                THREE.MathUtils
                  .lerp(
                    state
                      .startAngle,

                    state
                      .targetAngle,

                    eased
                  );

              state.pivot
                .rotation.y =
                state.currentAngle;

              if (
                progress >= 1
              ) {
                state.currentAngle =
                  state.targetAngle;

                state.pivot
                  .rotation.y =
                  state.targetAngle;

                state.animating =
                  false;
              }
            }
          );
      },


    remove:
      function () {
        this.el.removeEventListener(
          'model-loaded',
          this.onModelLoaded
        );

        this.el.removeEventListener(
          'activate-object',
          this.onActivateObject
        );

        this.el.removeEventListener(
          'click',
          this.onDesktopClick
        );
      }
  }
);


/* ============================================================
   AUTOMATIC DOOR PROXIMITY

   RELIABLE VERSION:
   - Waits for cua.glb / door-hinge to actually be ready.
   - Retries preparation if the component was attached before model-loaded.
   - Uses ONE cached CLOSED door bounding box as the trigger area.
   - Player position comes from #cam, so desktop movement, Quest joystick,
     teleport, and room-scale headset movement all count.
   - Opens when the player reaches openDistance.
   - Closes only after the player moves beyond closeDistance.
   - Trigger area does not move with the animated door leaf.
============================================================ */

AFRAME.registerComponent(
  'auto-door-proximity',
  {
    schema: {
      openDistance: {
        default: 1.25
      },

      closeDistance: {
        default: 1.75
      },

      interval: {
        default: 120
      },

      /*
        Small extra reach makes the trigger forgiving without requiring
        the player collider to physically touch the door model.
      */

      triggerPadding: {
        default: 0.18
      }
    },


    init: function () {
      this.lastCheck = 0;

      this.lastPrepareAttempt =
        0;

      this.ready =
        false;

      this.closedDoorBox =
        null;

      this.lastDistance =
        Infinity;

      this.playerPosition =
        new THREE.Vector3();

      this.closestPoint =
        new THREE.Vector3();

      this.prepareDoor =
        this.prepareDoor.bind(
          this
        );

      this.onDoorReady =
        this.onDoorReady.bind(
          this
        );

      this.el.addEventListener(
        'model-loaded',
        this.prepareDoor
      );

      this.el.addEventListener(
        'rooms-door-ready',
        this.onDoorReady
      );

      /*
        Handles both orders:

        1. component exists first, GLB loads later
        2. GLB was already loaded before this component was attached
      */

      this.prepareDoor();

      window.setTimeout(
        this.prepareDoor,
        0
      );

      window.setTimeout(
        this.prepareDoor,
        100
      );

      window.setTimeout(
        this.prepareDoor,
        400
      );

      window.setTimeout(
        this.prepareDoor,
        1000
      );
    },


    onDoorReady:
      function () {
        this.prepareDoor();
      },


    prepareDoor:
      function () {
        const hinge =
          this.el.components[
            'door-hinge'
          ];

        const mesh =
          this.el.getObject3D(
            'mesh'
          );

        if (
          !hinge ||
          !mesh
        ) {
          this.ready =
            false;

          return false;
        }

        /*
          If the model exists but door-hinge has not populated its parts yet,
          ask it to prepare immediately instead of waiting forever in tick().
        */

        if (
          !hinge.root ||
          !hinge.parts ||
          !hinge.parts.length
        ) {
          if (
            typeof hinge
              .onModelLoaded ===
              'function'
          ) {
            hinge.onModelLoaded();
          }
        }

        if (
          !hinge.root ||
          !hinge.parts ||
          !hinge.parts.length
        ) {
          this.ready =
            false;

          return false;
        }

        /*
          Cache the CLOSED world-space door footprint BEFORE any leaf opens.

          The automatic trigger therefore stays in the doorway instead of
          following the moving GLB mesh.
        */

        this.el.object3D
          .updateMatrixWorld(
            true
          );

        mesh.updateMatrixWorld(
          true
        );

        const box =
          new THREE.Box3()
            .setFromObject(
              mesh
            );

        if (
          box.isEmpty()
        ) {
          this.ready =
            false;

          return false;
        }

        this.closedDoorBox =
          box.clone();

        this.ready =
          true;

        console.log(
          'Automatic door ready:',

          {
            parts:
              hinge.parts.length,

            openDistance:
              this.data
                .openDistance,

            closeDistance:
              this.data
                .closeDistance,

            triggerPadding:
              this.data
                .triggerPadding,

            boxMin:
              this.closedDoorBox
                .min
                .toArray(),

            boxMax:
              this.closedDoorBox
                .max
                .toArray()
          }
        );

        return true;
      },


    getPlayerPosition:
      function () {
        const source =
          document.querySelector(
            '#cam'
          ) ||
          document.querySelector(
            '#rig'
          );

        if (!source) {
          return null;
        }

        source.object3D
          .getWorldPosition(
            this.playerPosition
          );

        return this
          .playerPosition;
      },


    getHorizontalDistance:
      function (player) {
        if (
          !player ||
          !this.closedDoorBox
        ) {
          return Infinity;
        }

        const box =
          this.closedDoorBox;

        this.closestPoint.set(
          THREE.MathUtils.clamp(
            player.x,
            box.min.x,
            box.max.x
          ),

          player.y,

          THREE.MathUtils.clamp(
            player.z,
            box.min.z,
            box.max.z
          )
        );

        return Math.hypot(
          player.x -
            this.closestPoint.x,

          player.z -
            this.closestPoint.z
        );
      },


    setDoorOpen:
      function (
        shouldOpen
      ) {
        const hinge =
          this.el.components[
            'door-hinge'
          ];

        if (
          !hinge ||
          !hinge.parts ||
          !hinge.parts.length
        ) {
          return false;
        }

        let changed =
          false;

        hinge.parts
          .forEach(
            (part) => {
              const state =
                hinge.createState(
                  part
                );

              if (!state) {
                return;
              }

              if (
                Boolean(
                  state.isOpen
                ) ===
                Boolean(
                  shouldOpen
                )
              ) {
                return;
              }

              if (
                hinge
                  .startDoorAnimation(
                    state,
                    Boolean(
                      shouldOpen
                    ),
                    true
                  )
              ) {
                changed =
                  true;
              }
            }
          );

        return changed;
      },


    tick:
      function (time) {
        if (
          roomsGameplayInputLocked() ||
          time -
            this.lastCheck <
            this.data.interval
        ) {
          return;
        }

        this.lastCheck =
          time;

        /*
          Never stay permanently dead if component/model initialization
          happened in an unexpected order.

          Retry approximately twice/sec.
        */

        if (
          !this.ready ||
          !this.closedDoorBox
        ) {
          if (
            time -
              this.lastPrepareAttempt >=
            500
          ) {
            this.lastPrepareAttempt =
              time;

            this.prepareDoor();
          }

          if (
            !this.ready ||
            !this.closedDoorBox
          ) {
            return;
          }
        }

        const player =
          this.getPlayerPosition();

        if (!player) {
          return;
        }

        const rawDistance =
          this.getHorizontalDistance(
            player
          );

        if (
          !Number.isFinite(
            rawDistance
          )
        ) {
          return;
        }

        this.lastDistance =
          rawDistance;

        const effectiveOpenDistance =
          Math.max(
            0,

            this.data
              .openDistance +
            this.data
              .triggerPadding
          );

        const effectiveCloseDistance =
          Math.max(
            effectiveOpenDistance +
              0.05,

            this.data
              .closeDistance +
            this.data
              .triggerPadding
          );

        const hinge =
          this.el.components[
            'door-hinge'
          ];

        if (
          !hinge ||
          !hinge.parts ||
          !hinge.parts.length
        ) {
          return;
        }

        const anyOpen =
          hinge.parts.some(
            (part) => {
              const state =
                hinge.createState(
                  part
                );

              return Boolean(
                state &&
                state.isOpen
              );
            }
          );

        if (
          rawDistance <=
            effectiveOpenDistance &&
          !anyOpen
        ) {
          if (
            this.setDoorOpen(
              true
            )
          ) {
            this.el.emit(
              'door-auto-opened',

              {
                distance:
                  rawDistance,

                effectiveOpenDistance
              },

              false
            );
          }

          return;
        }

        if (
          rawDistance >=
            effectiveCloseDistance &&
          anyOpen
        ) {
          if (
            this.setDoorOpen(
              false
            )
          ) {
            this.el.emit(
              'door-auto-closed',

              {
                distance:
                  rawDistance,

                effectiveCloseDistance
              },

              false
            );
          }
        }
      },


    remove:
      function () {
        this.el.removeEventListener(
          'model-loaded',
          this.prepareDoor
        );

        this.el.removeEventListener(
          'rooms-door-ready',
          this.onDoorReady
        );
      }
  }
);


/* ============================================================
   QUEST DOOR INTERACTION
============================================================ */

AFRAME.registerComponent(
  'vr-door-interactor',
  {
    schema: {
      pressThreshold: {
        default: 0.65
      },

      releaseThreshold: {
        default: 0.2
      }
    },


    init: function () {
      this.triggerHeld =
        false;

      this.pressTrigger =
        this.pressTrigger.bind(
          this
        );

      this.releaseTrigger =
        this.releaseTrigger.bind(
          this
        );

      this.onTriggerChanged =
        this.onTriggerChanged.bind(
          this
        );

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


    pressTrigger:
      function () {
        if (
          this.triggerHeld ||
          roomsGameplayInputLocked()
        ) {
          return;
        }

        this.triggerHeld =
          true;

        this.useDoor();
      },


    releaseTrigger:
      function () {
        this.triggerHeld =
          false;
      },


    onTriggerChanged:
      function (event) {
        const value =
          event &&
          event.detail &&
          typeof event
            .detail.value ===
            'number'
            ? event.detail.value
            : null;

        if (
          value === null
        ) {
          return;
        }

        if (
          value >=
            this.data
              .pressThreshold &&
          !this.triggerHeld
        ) {
          this.pressTrigger();

        } else if (
          value <=
            this.data
              .releaseThreshold
        ) {
          this.releaseTrigger();
        }
      },


    useDoor:
      function () {
        if (
          roomsGameplayInputLocked()
        ) {
          return;
        }

        const door =
          document.querySelector(
            '#door'
          );

        const raycaster =
          this.el.components
            .raycaster;

        if (
          !door ||
          !raycaster
        ) {
          return;
        }

        if (
          raycaster
            .refreshObjects
        ) {
          raycaster
            .refreshObjects();
        }

        const hit =
          raycaster
            .getIntersection
            ? raycaster
                .getIntersection(
                  door
                )
            : getClosestRayIntersection(
                raycaster
              );

        if (
          !hit ||
          !objectBelongsToEntity(
            hit.object,
            door
          )
        ) {
          return;
        }

        const component =
          door.components[
            'door-hinge'
          ];

        if (!component) {
          return;
        }

        if (
          !component.activatePart(
            hit.object
          )
        ) {
          component
            .activateDefaultPart();
        }
      },


    remove:
      function () {
        this.el.removeEventListener(
          'triggerdown',
          this.pressTrigger
        );

        this.el.removeEventListener(
          'triggerup',
          this.releaseTrigger
        );

        this.el.removeEventListener(
          'triggerchanged',
          this.onTriggerChanged
        );

        this.el.removeEventListener(
          'controllerdisconnected',
          this.releaseTrigger
        );
      }
  }
);


/* ============================================================
   STANDALONE TV — tv.glb

   #tv is the model and the interaction target.
   There is no #tvScreenHitbox anymore.
============================================================ */

AFRAME.registerComponent(
  'embedded-tv',
  {
    schema: {
      lightColor: {
        default:
          '#b9d8e8'
      },

      lightIntensity: {
        default:
          0.65
      },

      lightDistance: {
        default:
          1.25
      },

      flickerInterval: {
        default:
          180
      },

      glowOffset: {
        default:
          0.24
      }
    },


    init: function () {
      this.root =
        null;

      this.isOn =
        false;

      this.ready =
        false;

      this.componentPaused =
        false;

      this.screenPointWorld =
        new THREE.Vector3();

      this.screenNormalWorld =
        new THREE.Vector3(
          0,
          0,
          1
        );

      this.glowLight =
        null;

      this.lastFlickerUpdate =
        0;

      this.onModelLoaded =
        this.onModelLoaded.bind(
          this
        );

      this.onDesktopClick =
        this.onDesktopClick.bind(
          this
        );

      this.el.addEventListener(
        'model-loaded',
        this.onModelLoaded
      );

      this.el.addEventListener(
        'click',
        this.onDesktopClick
      );

      if (
        this.el.getObject3D(
          'mesh'
        )
      ) {
        this.onModelLoaded();
      }
    },


    onModelLoaded:
      function () {
        this.root =
          this.el.getObject3D(
            'mesh'
          );

        if (!this.root) {
          return;
        }

        this.updateTVWorldPosition();

        this.createGlowLight();

        this.positionGlowLight();

        this.ready =
          true;

        console.log(
          'Standalone TV ready: tv.glb is the interaction target.'
        );
      },


    updateTVWorldPosition:
      function () {
        if (!this.root) {
          return false;
        }

        this.root.updateMatrixWorld(
          true
        );

        const box =
          new THREE.Box3()
            .setFromObject(
              this.root
            );

        if (box.isEmpty()) {
          return false;
        }

        box.getCenter(
          this.screenPointWorld
        );

        const worldQuaternion =
          this.el.object3D
            .getWorldQuaternion(
              new THREE.Quaternion()
            );

        this.screenNormalWorld
          .set(
            0,
            0,
            1
          )
          .applyQuaternion(
            worldQuaternion
          )
          .normalize();

        const camera =
          document.querySelector(
            '#cam'
          );

        if (camera) {
          const cameraWorld =
            camera.object3D
              .getWorldPosition(
                new THREE.Vector3()
              );

          const towardPlayer =
            cameraWorld
              .clone()
              .sub(
                this
                  .screenPointWorld
              );

          towardPlayer.y *=
            0.25;

          if (
            towardPlayer
              .lengthSq() >
            0.0001
          ) {
            towardPlayer
              .normalize();

            if (
              this
                .screenNormalWorld
                .dot(
                  towardPlayer
                ) <
              0
            ) {
              this
                .screenNormalWorld
                .multiplyScalar(
                  -1
                );
            }
          }
        }

        if (
          window.setRoomsTVPosition
        ) {
          window.setRoomsTVPosition(
            this.screenPointWorld
          );
        }

        return true;
      },


    createGlowLight:
      function () {
        if (
          this.glowLight
        ) {
          return;
        }

        const light =
          document.createElement(
            'a-entity'
          );

        light.setAttribute(
          'id',
          'tvGlowLight'
        );

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

        this.el.sceneEl
          .appendChild(
            light
          );

        this.glowLight =
          light;
      },


    positionGlowLight:
      function () {
        if (
          !this.glowLight ||
          !this.root
        ) {
          return;
        }

        this.updateTVWorldPosition();

        const world =
          this.screenPointWorld
            .clone()
            .addScaledVector(
              this
                .screenNormalWorld,

              this.data
                .glowOffset
            );

        world.y +=
          0.02;

        this.el.sceneEl
          .object3D
          .updateMatrixWorld(
            true
          );

        const local =
          this.el.sceneEl
            .object3D
            .worldToLocal(
              world.clone()
            );

        this.glowLight
          .object3D
          .position
          .copy(
            local
          );
      },


    setState:
      function (on) {
        if (
          !this.ready
        ) {
          return false;
        }

        this.isOn =
          Boolean(on);

        this.positionGlowLight();

        if (
          this.glowLight
        ) {
          this.glowLight
            .setAttribute(
              'light',
              'intensity',
              this.isOn
                ? this.data
                    .lightIntensity
                : 0
            );
        }

        if (
          window.setRoomsTVState
        ) {
          window.setRoomsTVState(
            this.isOn
          );
        }

        const detail = {
          isOn:
            this.isOn
        };

        /*
          New event location.
        */

        this.el.emit(
          'tv-state-changed',
          detail,
          false
        );

        /*
          Compatibility with older story.js versions that listen on #living.
        */

        const living =
          document.querySelector(
            '#living'
          );

        if (
          living &&
          living !== this.el
        ) {
          living.emit(
            'tv-state-changed',
            detail,
            false
          );
        }

        console.log(
          this.isOn
            ? 'TV ON'
            : 'TV OFF'
        );

        return true;
      },


    toggle:
      function () {
        return this.setState(
          !this.isOn
        );
      },


    toggleFromIntersection:
      function (
        intersection
      ) {
        if (
          roomsGameplayInputLocked() ||
          !this.ready
        ) {
          return false;
        }

        if (
          !intersection ||
          !intersection.object ||
          !objectBelongsToEntity(
            intersection.object,
            this.el
          )
        ) {
          return false;
        }

        return this.toggle();
      },


    onDesktopClick:
      function (event) {
        if (
          roomsGameplayInputLocked() ||
          isImmersiveXRScene(
            this.el.sceneEl
          )
        ) {
          return;
        }

        const intersection =
          event &&
          event.detail &&
          event.detail
            .intersection
            ? event.detail
                .intersection
            : null;

        if (
          !intersection ||
          !objectBelongsToEntity(
            intersection.object,
            this.el
          )
        ) {
          return;
        }

        if (
          event.stopPropagation
        ) {
          event.stopPropagation();
        }

        this.toggleFromIntersection(
          intersection
        );
      },


    tick:
      function (time) {
        if (
          this.componentPaused ||
          roomsGameplayInputLocked() ||
          !this.isOn ||
          !this.glowLight
        ) {
          return;
        }

        if (
          time -
            this.lastFlickerUpdate <
          this.data
            .flickerInterval
        ) {
          return;
        }

        this.lastFlickerUpdate =
          time;

        const brightness =
          0.88 +
          Math.random() *
            0.12;

        this.glowLight
          .setAttribute(
            'light',
            'intensity',

            this.data
              .lightIntensity *
              brightness
          );
      },


    pause:
      function () {
        this.componentPaused =
          true;
      },


    play:
      function () {
        this.componentPaused =
          false;

        if (
          this.root
        ) {
          this.positionGlowLight();
        }
      },


    remove:
      function () {
        this.el.removeEventListener(
          'model-loaded',
          this.onModelLoaded
        );

        this.el.removeEventListener(
          'click',
          this.onDesktopClick
        );

        if (
          this.glowLight &&
          this.glowLight.parentNode
        ) {
          this.glowLight
            .parentNode
            .removeChild(
              this.glowLight
            );
        }

        this.glowLight =
          null;

        this.root =
          null;

        this.ready =
          false;
      }
  }
);


/* ============================================================
   QUEST TV INTERACTION
============================================================ */

AFRAME.registerComponent(
  'vr-tv-interactor',
  {
    schema: {
      pressThreshold: {
        default:
          0.65
      },

      releaseThreshold: {
        default:
          0.2
      }
    },


    init: function () {
      this.triggerHeld =
        false;

      this.pressTrigger =
        this.pressTrigger.bind(
          this
        );

      this.releaseTrigger =
        this.releaseTrigger.bind(
          this
        );

      this.onTriggerChanged =
        this.onTriggerChanged.bind(
          this
        );

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


    pressTrigger:
      function () {
        if (
          this.triggerHeld ||
          roomsGameplayInputLocked()
        ) {
          return;
        }

        this.triggerHeld =
          true;

        this.useTV();
      },


    releaseTrigger:
      function () {
        this.triggerHeld =
          false;
      },


    onTriggerChanged:
      function (event) {
        const value =
          event &&
          event.detail &&
          typeof event
            .detail.value ===
            'number'
            ? event.detail.value
            : null;

        if (
          value === null
        ) {
          return;
        }

        if (
          value >=
            this.data
              .pressThreshold &&
          !this.triggerHeld
        ) {
          this.pressTrigger();

        } else if (
          value <=
            this.data
              .releaseThreshold
        ) {
          this.releaseTrigger();
        }
      },


    useTV:
      function () {
        if (
          roomsGameplayInputLocked()
        ) {
          return false;
        }

        const tv =
          document.querySelector(
            '#tv'
          );

        const raycaster =
          this.el.components
            .raycaster;

        if (
          !tv ||
          !raycaster
        ) {
          return false;
        }

        const component =
          tv.components[
            'embedded-tv'
          ];

        if (
          !component ||
          !component.ready
        ) {
          return false;
        }

        if (
          raycaster
            .refreshObjects
        ) {
          raycaster
            .refreshObjects();
        }

        const hit =
          raycaster
            .getIntersection
            ? raycaster
                .getIntersection(
                  tv
                )
            : getClosestRayIntersection(
                raycaster
              );

        if (
          !hit ||
          !objectBelongsToEntity(
            hit.object,
            tv
          )
        ) {
          return false;
        }

        return component
          .toggleFromIntersection(
            hit
          );
      },


    remove:
      function () {
        this.el.removeEventListener(
          'triggerdown',
          this.pressTrigger
        );

        this.el.removeEventListener(
          'triggerup',
          this.releaseTrigger
        );

        this.el.removeEventListener(
          'triggerchanged',
          this.onTriggerChanged
        );

        this.el.removeEventListener(
          'controllerdisconnected',
          this.releaseTrigger
        );
      }
  }
);


/* ============================================================
   NATURAL GRABBABLE
============================================================ */

AFRAME.registerComponent(
  'natural-grabbable',
  {
    schema: {
      gravity: {
        default:
          -9.8
      },

      floorY: {
        default:
          0.015
      },

      throwMultiplier: {
        default:
          1
      },

      maxThrowSpeed: {
        default:
          6
      }
    },


    init: function () {
      this.heldBy =
        null;

      this.velocity =
        new THREE.Vector3();

      this.isMoving =
        false;

      this.lastSurfaceCheck =
        0;

      this.dropRay =
        new THREE.Raycaster();

      this.cachedRoomMeshes =
        [];

      this.roomMeshCacheTime =
        0;

      this.onDesktopClick =
        this.onDesktopClick.bind(
          this
        );

      this.el.addEventListener(
        'click',
        this.onDesktopClick
      );
    },


    onDesktopClick:
      function () {
        if (
          roomsGameplayInputLocked() ||
          isImmersiveXRScene(
            this.el.sceneEl
          )
        ) {
          return;
        }

        const hold =
          document.querySelector(
            '#desktopHold'
          );

        if (!hold) {
          return;
        }

        if (
          this.heldBy
        ) {
          this.release(
            new THREE.Vector3()
          );

        } else {
          this.grab(
            hold
          );
        }
      },


    getWorldBox:
      function () {
        const object =
          this.el.getObject3D(
            'mesh'
          ) ||
          this.el.object3D;

        object.updateMatrixWorld(
          true
        );

        return new THREE.Box3()
          .setFromObject(
            object
          );
      },


    distanceToPoint:
      function (point) {
        const box =
          this.getWorldBox();

        if (
          box.isEmpty()
        ) {
          return Infinity;
        }

        const closest =
          point
            .clone()
            .clamp(
              box.min,
              box.max
            );

        return closest
          .distanceTo(
            point
          );
      },


    reparentPreserveWorld:
      function (
        parentObject3D
      ) {
        parentObject3D
          .updateMatrixWorld(
            true
          );

        parentObject3D
          .attach(
            this.el.object3D
          );
      },


    grab:
      function (
        handEntity
      ) {
        if (
          roomsGameplayInputLocked() ||
          this.heldBy ||
          !handEntity
        ) {
          return false;
        }

        this.isMoving =
          false;

        this.velocity.set(
          0,
          0,
          0
        );

        this.heldBy =
          handEntity;

        this.reparentPreserveWorld(
          handEntity.object3D
        );

        this.el.addState(
          'grabbed'
        );

        return true;
      },


    release:
      function (
        velocity
      ) {
        if (
          !this.heldBy
        ) {
          return;
        }

        const scene =
          this.el.sceneEl;

        this.reparentPreserveWorld(
          scene.object3D
        );

        this.heldBy =
          null;

        this.el.removeState(
          'grabbed'
        );

        this.velocity.copy(
          velocity ||
          new THREE.Vector3()
        );

        this.velocity
          .multiplyScalar(
            this.data
              .throwMultiplier
          );

        this.velocity
          .clampLength(
            0,
            this.data
              .maxThrowSpeed
          );

        if (
          this.velocity.length() <
          0.22
        ) {
          this.isMoving =
            !this.settleOnSurface(
              0.45
            );

        } else {
          this.isMoving =
            true;
        }
      },


    getRoomMeshes:
      function () {
        const now =
          performance.now();

        if (
          this.cachedRoomMeshes
            .length &&
          now -
            this.roomMeshCacheTime <
          5000
        ) {
          return this
            .cachedRoomMeshes;
        }

        const meshes =
          [];

        this.el.sceneEl
          .querySelectorAll(
            '.roompart'
          )
          .forEach(
            (entity) => {
              const root =
                entity.getObject3D(
                  'mesh'
                );

              if (!root) {
                return;
              }

              root.traverse(
                (node) => {
                  if (
                    node.isMesh
                  ) {
                    meshes.push(
                      node
                    );
                  }
                }
              );
            }
          );

        this.cachedRoomMeshes =
          meshes;

        this.roomMeshCacheTime =
          now;

        return meshes;
      },


    settleOnSurface:
      function (
        maxDistance
      ) {
        const meshes =
          this.getRoomMeshes();

        if (
          !meshes.length
        ) {
          return false;
        }

        const box =
          this.getWorldBox();

        if (
          box.isEmpty()
        ) {
          return false;
        }

        const center =
          box.getCenter(
            new THREE.Vector3()
          );

        const origin =
          new THREE.Vector3(
            center.x,
            box.min.y +
              0.08,
            center.z
          );

        this.dropRay.set(
          origin,

          new THREE.Vector3(
            0,
            -1,
            0
          )
        );

        this.dropRay.far =
          maxDistance +
          0.08;

        const hits =
          this.dropRay
            .intersectObjects(
              meshes,
              true
            );

        const hit =
          hits.find(
            (candidate) =>
              !objectBelongsToEntity(
                candidate.object,
                this.el
              )
          );

        if (!hit) {
          return false;
        }

        const gap =
          box.min.y -
          hit.point.y;

        if (
          gap < -0.03 ||
          gap > maxDistance
        ) {
          return false;
        }

        this.el.object3D
          .position.y +=
          hit.point.y -
          box.min.y +
          0.012;

        this.velocity.set(
          0,
          0,
          0
        );

        return true;
      },


    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          roomsGameplayInputLocked() ||
          this.heldBy ||
          !this.isMoving ||
          !deltaTime
        ) {
          return;
        }

        const dt =
          Math.min(
            deltaTime /
              1000,
            0.04
          );

        this.velocity.y +=
          this.data.gravity *
          dt;

        this.el.object3D
          .position
          .addScaledVector(
            this.velocity,
            dt
          );

        const damping =
          Math.pow(
            0.985,
            dt * 60
          );

        this.velocity.x *=
          damping;

        this.velocity.z *=
          damping;

        const box =
          this.getWorldBox();

        if (
          !box.isEmpty()
        ) {
          const penetration =
            this.data.floorY -
            box.min.y;

          if (
            penetration > 0
          ) {
            this.el.object3D
              .position.y +=
              penetration;

            if (
              Math.abs(
                this.velocity.y
              ) >
              0.8
            ) {
              this.velocity.y *=
                -0.12;

              this.velocity.x *=
                0.72;

              this.velocity.z *=
                0.72;

            } else {
              this.velocity.set(
                0,
                0,
                0
              );

              this.isMoving =
                false;
            }
          }
        }

        if (
          this.isMoving &&
          this.velocity.y <=
            0 &&
          time -
            this.lastSurfaceCheck >
            130
        ) {
          this.lastSurfaceCheck =
            time;

          if (
            this.settleOnSurface(
              0.12
            )
          ) {
            this.isMoving =
              false;
          }
        }
      },


    remove:
      function () {
        this.el.removeEventListener(
          'click',
          this.onDesktopClick
        );
      }
  }
);


/* ============================================================
   QUEST NATURAL GRAB HAND
============================================================ */

AFRAME.registerComponent(
  'natural-grab-hand',
  {
    schema: {
      radius: {
        default:
          0.4
      },

      velocitySmoothing: {
        default:
          0.35
      },

      gripThreshold: {
        default:
          0.5
      }
    },


    init: function () {
      this.heldItem =
        null;

      this.gripHeld =
        false;

      this.previousPosition =
        new THREE.Vector3();

      this.currentPosition =
        new THREE.Vector3();

      this.instantVelocity =
        new THREE.Vector3();

      this.smoothedVelocity =
        new THREE.Vector3();

      this.hasPreviousPosition =
        false;

      this.beginGrip =
        this.beginGrip.bind(
          this
        );

      this.endGrip =
        this.endGrip.bind(
          this
        );

      this.onGripChanged =
        this.onGripChanged.bind(
          this
        );

      [
        'gripdown',
        'squeezestart',
        'abuttondown',
        'xbuttondown'
      ].forEach(
        (name) => {
          this.el.addEventListener(
            name,
            this.beginGrip
          );
        }
      );

      [
        'gripup',
        'squeezeend',
        'abuttonup',
        'xbuttonup',
        'controllerdisconnected'
      ].forEach(
        (name) => {
          this.el.addEventListener(
            name,
            this.endGrip
          );
        }
      );

      this.el.addEventListener(
        'gripchanged',
        this.onGripChanged
      );
    },


    onGripChanged:
      function (event) {
        const value =
          event &&
          event.detail &&
          typeof event
            .detail.value ===
            'number'
            ? event.detail.value
            : null;

        if (
          value === null
        ) {
          return;
        }

        if (
          value >=
          this.data
            .gripThreshold
        ) {
          this.beginGrip();

        } else if (
          value <=
          0.2
        ) {
          this.endGrip();
        }
      },


    beginGrip:
      function () {
        if (
          roomsGameplayInputLocked() ||
          this.gripHeld
        ) {
          return;
        }

        this.gripHeld =
          true;

        this.grabNearest();
      },


    endGrip:
      function () {
        if (
          !this.gripHeld &&
          !this.heldItem
        ) {
          return;
        }

        this.gripHeld =
          false;

        this.releaseHeld();
      },


    findNearest:
      function () {
        const handPosition =
          new THREE.Vector3();

        this.el.object3D
          .getWorldPosition(
            handPosition
          );

        let nearest =
          null;

        let nearestDistance =
          Infinity;

        this.el.sceneEl
          .querySelectorAll(
            '[natural-grabbable]'
          )
          .forEach(
            (entity) => {
              const component =
                entity.components[
                  'natural-grabbable'
                ];

              if (
                !component ||
                component.heldBy
              ) {
                return;
              }

              const distance =
                component
                  .distanceToPoint(
                    handPosition
                  );

              if (
                distance <
                nearestDistance
              ) {
                nearest =
                  component;

                nearestDistance =
                  distance;
              }
            }
          );

        return {
          nearest,
          nearestDistance
        };
      },


    grabNearest:
      function () {
        if (
          roomsGameplayInputLocked() ||
          this.heldItem
        ) {
          return;
        }

        const result =
          this.findNearest();

        if (
          !result.nearest ||
          result.nearestDistance >
            this.data.radius
        ) {
          return;
        }

        if (
          result.nearest.grab(
            this.el
          )
        ) {
          this.heldItem =
            result.nearest;
        }
      },


    releaseHeld:
      function () {
        if (
          !this.heldItem
        ) {
          return;
        }

        const item =
          this.heldItem;

        this.heldItem =
          null;

        item.release(
          roomsGameplayInputLocked()
            ? new THREE.Vector3()
            : this
                .smoothedVelocity
                .clone()
        );
      },


    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          !deltaTime
        ) {
          return;
        }

        this.el.object3D
          .getWorldPosition(
            this.currentPosition
          );

        if (
          !this.hasPreviousPosition
        ) {
          this.previousPosition
            .copy(
              this.currentPosition
            );

          this.hasPreviousPosition =
            true;

          return;
        }

        const seconds =
          deltaTime /
          1000;

        if (
          seconds > 0
        ) {
          this.instantVelocity
            .subVectors(
              this.currentPosition,
              this.previousPosition
            )
            .divideScalar(
              seconds
            );

          this.smoothedVelocity
            .lerp(
              this.instantVelocity,
              this.data
                .velocitySmoothing
            );

          this.previousPosition
            .copy(
              this.currentPosition
            );
        }
      },


    remove:
      function () {
        [
          'gripdown',
          'squeezestart',
          'abuttondown',
          'xbuttondown'
        ].forEach(
          (name) => {
            this.el.removeEventListener(
              name,
              this.beginGrip
            );
          }
        );

        [
          'gripup',
          'squeezeend',
          'abuttonup',
          'xbuttonup',
          'controllerdisconnected'
        ].forEach(
          (name) => {
            this.el.removeEventListener(
              name,
              this.endGrip
            );
          }
        );

        this.el.removeEventListener(
          'gripchanged',
          this.onGripChanged
        );

        if (
          this.heldItem
        ) {
          const item =
            this.heldItem;

          this.heldItem =
            null;

          this.gripHeld =
            false;

          item.release(
            new THREE.Vector3()
          );
        }
      }
  }
);


/* ============================================================
   AUTOMATIC SETUP
============================================================ */

function setupRoomsInteractions() {
  const scene =
    document.querySelector(
      'a-scene'
    );

  const door =
    document.querySelector(
      '#door'
    );

  const living =
    document.querySelector(
      '#living'
    );

  const tv =
    document.querySelector(
      '#tv'
    );

  const cursor =
    document.querySelector(
      'a-cursor'
    );

  const rightHand =
    document.querySelector(
      '#rightHand'
    );

  if (!scene) {
    return;
  }


  /* ----------------------------------------------------------
     AUTOMATIC DOOR
  ---------------------------------------------------------- */

  if (
    door &&
    !door.hasAttribute(
      'auto-door-proximity'
    )
  ) {
    door.setAttribute(
      'auto-door-proximity',

      `
        openDistance: 1.25;
        closeDistance: 1.75;
        interval: 120
      `
    );
  }


  /* ----------------------------------------------------------
     LIVINGASSET.GLB IS NOT THE TV
  ---------------------------------------------------------- */

  if (
    living
  ) {
    living.classList.remove(
      'tv-interactable'
    );

    if (
      living.hasAttribute(
        'embedded-tv'
      )
    ) {
      living.removeAttribute(
        'embedded-tv'
      );
    }
  }


  /* ----------------------------------------------------------
     TV.GLB IS THE COMPLETE TV TARGET
  ---------------------------------------------------------- */

  if (
    tv
  ) {
    tv.classList.add(
      'tv-interactable'
    );

    if (
      !tv.hasAttribute(
        'embedded-tv'
      )
    ) {
      tv.setAttribute(
        'embedded-tv',
        ''
      );
    }

    appendRaycasterObjectSelector(
      cursor,
      '#tv'
    );

    appendRaycasterObjectSelector(
      rightHand,
      '#tv'
    );

  } else {
    console.warn(
      'TV interaction: #tv was not found. Make sure index.html loads tv.glb with id="tv".'
    );
  }


  if (
    rightHand &&
    !rightHand.hasAttribute(
      'vr-tv-interactor'
    )
  ) {
    rightHand.setAttribute(
      'vr-tv-interactor',
      ''
    );
  }


  console.log(
    'Rooms interactions ready: automatic door + standalone tv.glb + grabbing.'
  );
}


/* ============================================================
   DEBUG
============================================================ */

function getRoomsInteractionDebug() {
  const scene =
    document.querySelector(
      'a-scene'
    );

  const door =
    document.querySelector(
      '#door'
    );

  const tvEntity =
    document.querySelector(
      '#tv'
    );

  const doorComponent =
    door &&
    door.components
      ? door.components[
          'door-hinge'
        ]
      : null;

  const autoDoor =
    door &&
    door.components
      ? door.components[
          'auto-door-proximity'
        ]
      : null;

  const tv =
    tvEntity &&
    tvEntity.components
      ? tvEntity.components[
          'embedded-tv'
        ]
      : null;

  const doorStates =
    [];

  if (
    doorComponent
  ) {
    doorComponent
      .partStates
      .forEach(
        (state) => {
          doorStates.push({
            isOpen:
              Boolean(
                state.isOpen
              ),

            animating:
              Boolean(
                state.animating
              ),

            angleDegrees:
              Number(
                THREE.MathUtils
                  .radToDeg(
                    state
                      .currentAngle
                  )
                  .toFixed(
                    1
                  )
              )
          });
        }
      );
  }

  return {
    immersiveXR:
      isImmersiveXRScene(
        scene
      ),

    inputLocked:
      roomsGameplayInputLocked(),

    automaticDoorReady:
      Boolean(
        autoDoor &&
        autoDoor.ready
      ),

    automaticDoorComponentFound:
      Boolean(
        autoDoor
      ),

    automaticDoorDistance:
      autoDoor &&
      Number.isFinite(
        autoDoor.lastDistance
      )
        ? Number(
            autoDoor
              .lastDistance
              .toFixed(
                3
              )
          )
        : null,

    automaticDoorOpenDistance:
      autoDoor
        ? Number(
            (
              autoDoor.data
                .openDistance +
              autoDoor.data
                .triggerPadding
            )
              .toFixed(
                3
              )
          )
        : null,

    automaticDoorCloseDistance:
      autoDoor
        ? Number(
            (
              autoDoor.data
                .closeDistance +
              autoDoor.data
                .triggerPadding
            )
              .toFixed(
                3
              )
          )
        : null,

    doorParts:
      doorComponent
        ? doorComponent
            .parts.length
        : 0,

    doorStates,

    standaloneTVFound:
      Boolean(
        tvEntity
      ),

    tvReady:
      Boolean(
        tv &&
        tv.ready
      ),

    tvOn:
      Boolean(
        tv &&
        tv.isOn
      ),

    tvWorldPosition:
      tv &&
      tv.ready
        ? {
            x:
              Number(
                tv
                  .screenPointWorld
                  .x
                  .toFixed(
                    3
                  )
              ),

            y:
              Number(
                tv
                  .screenPointWorld
                  .y
                  .toFixed(
                    3
                  )
              ),

            z:
              Number(
                tv
                  .screenPointWorld
                  .z
                  .toFixed(
                    3
                  )
              )
          }
        : null,

    grabbableCount:
      document
        .querySelectorAll(
          '[natural-grabbable]'
        )
        .length
  };
}


window.getRoomsInteractionDebug =
  getRoomsInteractionDebug;


/* ============================================================
   TV DEBUG
============================================================ */

function getRoomsTVDebug() {
  const tvEntity =
    document.querySelector(
      '#tv'
    );

  const component =
    tvEntity &&
    tvEntity.components
      ? tvEntity.components[
          'embedded-tv'
        ]
      : null;

  return {
    tvFound:
      Boolean(
        tvEntity
      ),

    modelLoaded:
      Boolean(
        component &&
        component.root
      ),

    componentReady:
      Boolean(
        component &&
        component.ready
      ),

    tvOn:
      Boolean(
        component &&
        component.isOn
      ),

    worldPosition:
      component &&
      component.ready
        ? component
            .screenPointWorld
            .toArray()
        : null,

    frontDirection:
      component &&
      component.ready
        ? component
            .screenNormalWorld
            .toArray()
        : null,

    glowFound:
      Boolean(
        document.querySelector(
          '#tvGlowLight'
        )
      )
  };
}


window.getRoomsTVDebug =
  getRoomsTVDebug;


/* ============================================================
   STARTUP
============================================================ */

window.addEventListener(
  'DOMContentLoaded',
  () => {
    const scene =
      document.querySelector(
        'a-scene'
      );

    if (!scene) {
      return;
    }

    if (
      scene.hasLoaded
    ) {
      setupRoomsInteractions();

    } else {
      scene.addEventListener(
        'loaded',
        setupRoomsInteractions,
        {
          once: true
        }
      );
    }
  }
);