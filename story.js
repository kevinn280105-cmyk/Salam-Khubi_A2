 /* ============================================================
   story.js — ROOMS WITHIN
   FULL REPLACEMENT

   Flow:
   1. Inspect Teddy Bear.
   2. Inspect Hair Clipper.
   3. Inspect Picture.
   4. Final placement objective unlocks.
   5. Release each physical item over #truocbantho.
   6. Each item immediately snaps into its own altar spot,
      stops moving, and becomes permanently locked in place.
   7. After TWO items:
      monster.js shows standing.glb.
   8. The third item may still be placed, BUT the final ending
      waits until the standing.glb blackout/disappearance event
      has completely finished.
   9. After all 3 are locked AND standing.glb is finished:
      lights stop flickering.
   10. Existing all-clues-collected ending/jumpscare runs.
   11. GAME COMPLETE appears and gameplay locks.

   IMPORTANT:
   - Normal grabbing / throwing still works everywhere else.
   - Only Teddy, Hair Clipper and Picture can snap.
   - They only snap after the final placement objective is ready.
   - Snapping also updates the existing quest checklist.
============================================================ */

const ROOMS_STORY_MILESTONES = [
  'teddy',
  'hair-clipper',
  'picture'
];

const ROOMS_STORY_LABELS = {
  'teddy': 'Teddy Bear inspected',
  'hair-clipper': 'Hair Clipper inspected',
  'picture': 'Picture inspected'
};

const ROOMS_FINAL_ITEMS = [
  {
    key: 'teddy',

    /*
      Left-side snap slot.
    */
    snapFraction: 0.22,

    selectors: [
      '#teddy',
      '[data-quest-item="teddy"]'
    ]
  },

  {
    key: 'hair-clipper',

    /*
      Right-side snap slot.
    */
    snapFraction: 0.78,

    selectors: [
      '#hairClipper',
      '#hair-clipper',
      '#clipper',
      '#hairpin',
      '[data-quest-item="hair-clipper"]'
    ]
  },

  {
    key: 'picture',

    /*
      Middle snap slot.
    */
    snapFraction: 0.50,

    selectors: [
      '#picture',
      '#photo',
      '#pictureFrame',
      '#picture-frame',
      '[data-quest-item="picture"]'
    ]
  }
];

const ROOMS_FINAL_PLACEMENT = {
  targetSelector: '#truocbantho',

  checkInterval: 150,

  /*
    Existing placement detection padding.
  */
  horizontalPadding: 0.10,

  belowPadding: 0.12,

  abovePadding: 1.20,

  /*
    Snap capture area.
  */
  snapHorizontalPadding: 0.18,

  snapBelowPadding: 0.15,

  snapAbovePadding: 1.25,

  /*
    Tiny gap above the table surface.
  */
  snapSurfaceGap: 0.012,

  /*
    Used to raycast toward the real top
    of truocbantho.glb.
  */
  surfaceRayExtraHeight: 1.50,

  surfaceRayExtraDepth: 3.00,

  /*
    Once everything is ready,
    wait briefly before ending.
  */
  settleTime: 700,

  endScreenDelay: 2600
};


/* ============================================================
   HELPERS
============================================================ */

function roomsStoryFindFirst(selectors) {
  for (
    const selector
    of selectors || []
  ) {
    const entity =
      document.querySelector(
        selector
      );

    if (entity) {
      return entity;
    }
  }

  return null;
}


function roomsStoryGetModelBox(entity) {
  if (!entity) {
    return null;
  }

  const root =
    entity.getObject3D(
      'mesh'
    );

  if (!root) {
    return null;
  }

  entity.object3D
    .updateMatrixWorld(
      true
    );

  root.updateMatrixWorld(
    true
  );

  const box =
    new THREE.Box3()
      .setFromObject(
        root
      );

  return box.isEmpty()
    ? null
    : box;
}


function roomsStoryEntityIsGrabbed(
  entity
) {
  if (!entity) {
    return false;
  }

  if (
    entity.is &&
    entity.is(
      'grabbed'
    )
  ) {
    return true;
  }

  const grabbable =
    entity.components &&
    entity.components[
      'natural-grabbable'
    ];

  return Boolean(
    grabbable &&
    grabbable.heldBy
  );
}


/* ============================================================
   CURRENT HOVER / INSPECTION STATE
============================================================ */

function roomsStoryGetInspectedKeys() {
  if (
    typeof window
      .getRoomsQuestState !==
    'function'
  ) {
    return [];
  }

  try {
    const state =
      window
        .getRoomsQuestState();

    return Array.isArray(
      state &&
      state.inspected
    )
      ? state.inspected
      : [];

  } catch (
    error
  ) {
    console.warn(
      'Story manager could not read quest inspection state:',
      error
    );

    return [];
  }
}


/* ============================================================
   SNAP-ZONE CHECK
============================================================ */

function roomsStoryItemCanSnap(
  itemEntity,
  targetBox
) {
  if (
    !itemEntity ||
    !targetBox ||
    roomsStoryEntityIsGrabbed(
      itemEntity
    )
  ) {
    return false;
  }

  const itemBox =
    roomsStoryGetModelBox(
      itemEntity
    );

  if (!itemBox) {
    return false;
  }

  const center =
    itemBox.getCenter(
      new THREE.Vector3()
    );

  const xInside =
    center.x >=
      targetBox.min.x -
        ROOMS_FINAL_PLACEMENT
          .snapHorizontalPadding &&
    center.x <=
      targetBox.max.x +
        ROOMS_FINAL_PLACEMENT
          .snapHorizontalPadding;

  const zInside =
    center.z >=
      targetBox.min.z -
        ROOMS_FINAL_PLACEMENT
          .snapHorizontalPadding &&
    center.z <=
      targetBox.max.z +
        ROOMS_FINAL_PLACEMENT
          .snapHorizontalPadding;

  const verticalNear =
    itemBox.max.y >=
      targetBox.min.y -
        ROOMS_FINAL_PLACEMENT
          .snapBelowPadding &&
    itemBox.min.y <=
      targetBox.max.y +
        ROOMS_FINAL_PLACEMENT
          .snapAbovePadding;

  return Boolean(
    xInside &&
    zInside &&
    verticalNear
  );
}


/* ============================================================
   WORLD TRANSLATION
============================================================ */

function roomsStoryTranslateEntityWorld(
  entity,
  delta
) {
  if (
    !entity ||
    !entity.object3D ||
    !delta
  ) {
    return false;
  }

  const object =
    entity.object3D;

  const parent =
    object.parent;

  const currentWorld =
    new THREE.Vector3();

  object.getWorldPosition(
    currentWorld
  );

  const desiredWorld =
    currentWorld
      .clone()
      .add(
        delta
      );

  if (
    parent
  ) {
    parent.updateMatrixWorld(
      true
    );

    parent.worldToLocal(
      desiredWorld
    );
  }

  object.position.copy(
    desiredWorld
  );

  object.updateMatrixWorld(
    true
  );

  return true;
}


/* ============================================================
   ALTAR SURFACE HEIGHT
============================================================ */

function roomsStoryGetTargetSurfaceY(
  targetEntity,
  targetBox,
  x,
  z
) {
  if (
    !targetEntity ||
    !targetBox
  ) {
    return null;
  }

  const root =
    targetEntity.getObject3D(
      'mesh'
    );

  if (!root) {
    return targetBox.max.y;
  }

  targetEntity.object3D
    .updateMatrixWorld(
      true
    );

  root.updateMatrixWorld(
    true
  );

  const ray =
    new THREE.Raycaster();

  const origin =
    new THREE.Vector3(
      x,

      targetBox.max.y +
        ROOMS_FINAL_PLACEMENT
          .surfaceRayExtraHeight,

      z
    );

  ray.set(
    origin,

    new THREE.Vector3(
      0,
      -1,
      0
    )
  );

  ray.far =
    (
      targetBox.max.y -
      targetBox.min.y
    ) +
    ROOMS_FINAL_PLACEMENT
      .surfaceRayExtraHeight +
    ROOMS_FINAL_PLACEMENT
      .surfaceRayExtraDepth;

  const hits =
    ray.intersectObject(
      root,
      true
    );

  if (
    hits &&
    hits.length
  ) {
    return hits[0]
      .point
      .y;
  }

  return targetBox.max.y;
}


/* ============================================================
   STOP QUEST ITEM PHYSICS
============================================================ */

function roomsStoryStopItemPhysics(
  entity
) {
  if (!entity) {
    return;
  }

  const grabbable =
    entity.components &&
    entity.components[
      'natural-grabbable'
    ];

  if (
    grabbable
  ) {
    grabbable.heldBy =
      null;

    if (
      grabbable.velocity
    ) {
      grabbable.velocity.set(
        0,
        0,
        0
      );
    }

    grabbable.isMoving =
      false;
  }

  if (
    entity.is &&
    entity.is(
      'grabbed'
    )
  ) {
    entity.removeState(
      'grabbed'
    );
  }
}


/* ============================================================
   ITEM ON TARGET CHECK
============================================================ */

function roomsStoryItemIsOnTarget(
  itemEntity,
  targetBox
) {
  if (
    !itemEntity ||
    !targetBox ||
    roomsStoryEntityIsGrabbed(
      itemEntity
    )
  ) {
    return false;
  }

  const itemBox =
    roomsStoryGetModelBox(
      itemEntity
    );

  if (!itemBox) {
    return false;
  }

  const center =
    itemBox.getCenter(
      new THREE.Vector3()
    );

  const xInside =
    center.x >=
      targetBox.min.x -
        ROOMS_FINAL_PLACEMENT
          .horizontalPadding &&
    center.x <=
      targetBox.max.x +
        ROOMS_FINAL_PLACEMENT
          .horizontalPadding;

  const zInside =
    center.z >=
      targetBox.min.z -
        ROOMS_FINAL_PLACEMENT
          .horizontalPadding &&
    center.z <=
      targetBox.max.z +
        ROOMS_FINAL_PLACEMENT
          .horizontalPadding;

  const verticalNear =
    itemBox.max.y >=
      targetBox.min.y -
        ROOMS_FINAL_PLACEMENT
          .belowPadding &&
    itemBox.min.y <=
      targetBox.max.y +
        ROOMS_FINAL_PLACEMENT
          .abovePadding;

  return Boolean(
    xInside &&
    zInside &&
    verticalNear
  );
}


/* ============================================================
   SIMPLE UI HELPERS
============================================================ */

function roomsStorySetVisible(
  entity,
  visible
) {
  if (entity) {
    entity.setAttribute(
      'visible',
      Boolean(
        visible
      )
    );
  }
}


function roomsStoryCreateText(
  value,
  position,
  width,
  align = 'center',
  color = '#ffffff',
  wrapCount = 28
) {
  const text =
    document.createElement(
      'a-text'
    );

  text.setAttribute(
    'value',
    value || ''
  );

  text.setAttribute(
    'position',
    position || '0 0 0'
  );

  text.setAttribute(
    'width',
    width || '1'
  );

  text.setAttribute(
    'align',
    align
  );

  text.setAttribute(
    'color',
    color
  );

  text.setAttribute(
    'wrap-count',
    String(
      wrapCount
    )
  );

  text.setAttribute(
    'side',
    'double'
  );

  text.setAttribute(
    'material',
    'shader: flat; ' +
    'depthTest: false; ' +
    'depthWrite: false'
  );

  return text;
}


/* ============================================================
   STORY MANAGER
============================================================ */

AFRAME.registerComponent(
  'story-manager',
  {
    init: function () {
      this.collected =
        new Set();

      this.inspectedComplete =
        false;

      this.completed =
        false;

      this.listeners =
        [];

      this.itemEntities =
        new Map();

      this.targetEntity =
        null;

      this.lastPlacementCheck =
        0;

      this.allPlacedSince =
        null;

      this.endTimer =
        null;

      this.placementPrompt =
        null;

      this.endRoot =
        null;


      /*
        NEW:

        True while all three objects are ready,
        but monster.js is still completing
        the standing.glb scare.
      */

      this.waitingForStandingScare =
        false;


      /*
        Items permanently snapped onto altar.
      */

      this.lockedItems =
        new Set();


      /*
        Release-state tracking.
      */

      this.itemHeldState =
        new Map();

      this.itemReleaseListeners =
        new Map();

      this.pendingSnapFrames =
        new Map();


      this.onQuestItemFound =
        this.onQuestItemFound
          .bind(
            this
          );

      this.onQuestItemsComplete =
        this.onQuestItemsComplete
          .bind(
            this
          );


      this.bindCurrentStory();

      this.buildFinalUI();

      this.refreshFinalEntities();

      this.syncInspectionProgress();


      [
        100,
        500,
        1200,
        2500
      ].forEach(
        (delay) => {
          window.setTimeout(
            () => {
              this.refreshFinalEntities();
            },

            delay
          );
        }
      );


      window.getRoomsStoryState =
        () => ({
          inspected:
            Array.from(
              this.collected
            ),

          inspectedCount:
            this.collected.size,

          inspectedTotal:
            ROOMS_STORY_MILESTONES
              .length,

          inspectedComplete:
            this.inspectedComplete,

          finalPlacement:
            this.getPlacementState(),

          snapped:
            Array.from(
              this.lockedItems
            ),

          waitingForStandingScare:
            this
              .waitingForStandingScare,

          completed:
            this.completed
        });


      console.log(
        'Story manager ready. ' +
        'Inspect all 3 items, then ' +
        'place all 3 on #truocbantho.'
      );
    },


    /* ========================================================
       LISTENERS
    ======================================================== */

    listen: function (
      target,
      eventName,
      handler
    ) {
      if (
        !target ||
        !eventName ||
        !handler
      ) {
        return;
      }

      target.addEventListener(
        eventName,
        handler
      );

      this.listeners.push({
        target,
        eventName,
        handler
      });
    },


    bindCurrentStory:
      function () {
        const scene =
          this.el.sceneEl;

        if (!scene) {
          console.warn(
            'Story manager: ' +
            'scene was not found.'
          );

          return;
        }

        this.listen(
          scene,
          'quest-item-found',
          this.onQuestItemFound
        );

        this.listen(
          scene,
          'quest-items-complete',
          this.onQuestItemsComplete
        );
      },


    /* ========================================================
       FINAL ENTITIES
    ======================================================== */

    refreshFinalEntities:
      function () {
        this.targetEntity =
          document.querySelector(
            ROOMS_FINAL_PLACEMENT
              .targetSelector
          );

        ROOMS_FINAL_ITEMS
          .forEach(
            (item) => {
              const entity =
                roomsStoryFindFirst(
                  item.selectors
                );

              if (!entity) {
                return;
              }

              this.itemEntities
                .set(
                  item.key,
                  entity
                );

              this.watchFinalItem(
                item.key,
                entity
              );
            }
          );
      },


    /* ========================================================
       WATCH RELEASES
    ======================================================== */

    watchFinalItem:
      function (
        key,
        entity
      ) {
        if (
          !key ||
          !entity
        ) {
          return;
        }


        this.itemHeldState
          .set(
            key,

            roomsStoryEntityIsGrabbed(
              entity
            )
          );


        if (
          this.itemReleaseListeners
            .has(
              entity
            )
        ) {
          return;
        }


        const handler =
          (event) => {
            const state =
              event &&
              event.detail
                ? event.detail.state
                : '';


            if (
              state !==
              'grabbed'
            ) {
              return;
            }


            this.itemHeldState
              .set(
                key,
                false
              );


            /*
              Run after natural-grabbable finishes release().
            */

            this.scheduleSnapAttempt(
              key,
              entity
            );
          };


        entity.addEventListener(
          'stateremoved',
          handler
        );


        this.itemReleaseListeners
          .set(
            entity,
            handler
          );
      },


    scheduleSnapAttempt:
      function (
        key,
        entity
      ) {
        if (
          !key ||
          !entity ||
          this.lockedItems
            .has(
              key
            )
        ) {
          return;
        }


        const previousFrame =
          this.pendingSnapFrames
            .get(
              key
            );


        if (
          previousFrame !==
          undefined
        ) {
          window
            .cancelAnimationFrame(
              previousFrame
            );
        }


        const frame =
          window
            .requestAnimationFrame(
              () => {
                this.pendingSnapFrames
                  .delete(
                    key
                  );

                this.trySnapItem(
                  key,
                  entity
                );
              }
            );


        this.pendingSnapFrames
          .set(
            key,
            frame
          );
      },


    /* ========================================================
       INSPECTION PROGRESS
    ======================================================== */

    syncInspectionProgress:
      function () {
        if (
          this.completed
        ) {
          return;
        }


        const inspected =
          roomsStoryGetInspectedKeys();


        inspected
          .forEach(
            (key) => {
              if (
                ROOMS_STORY_MILESTONES
                  .includes(
                    key
                  ) &&

                !this.collected
                  .has(
                    key
                  )
              ) {
                this.collectMilestone(
                  key,

                  ROOMS_STORY_LABELS[
                    key
                  ] ||
                  key
                );
              }
            }
          );
      },


    onQuestItemFound:
      function (
        event
      ) {
        const detail =
          event &&
          event.detail
            ? event.detail
            : {};


        const key =
          String(
            detail.key || ''
          );


        if (
          !ROOMS_STORY_MILESTONES
            .includes(
              key
            )
        ) {
          return;
        }


        this.collectMilestone(
          key,

          ROOMS_STORY_LABELS[
            key
          ] ||

          detail.title ||

          key
        );
      },


    onQuestItemsComplete:
      function () {
        if (
          this.completed
        ) {
          return;
        }


        ROOMS_STORY_MILESTONES
          .forEach(
            (id) => {
              if (
                !this.collected
                  .has(
                    id
                  )
              ) {
                this.collectMilestone(
                  id,

                  ROOMS_STORY_LABELS[
                    id
                  ]
                );
              }
            }
          );


        this.armFinalPlacement();
      },


    collectMilestone:
      function (
        id,
        label
      ) {
        if (
          this.completed ||

          !id ||

          this.collected
            .has(
              id
            ) ||

          !ROOMS_STORY_MILESTONES
            .includes(
              id
            )
        ) {
          return false;
        }


        this.collected
          .add(
            id
          );


        const detail = {
          id,

          label:
            label || id,

          count:
            this.collected
              .size,

          total:
            ROOMS_STORY_MILESTONES
              .length,

          collected:
            Array.from(
              this.collected
            )
        };


        console.log(
          `Story progress: ${detail.label} ` +
          `(${detail.count}/${detail.total})`
        );


        this.el.emit(
          'clue-collected',
          detail,
          false
        );


        this.el.sceneEl.emit(
          'story-progress',
          detail,
          false
        );


        if (
          this.collected
            .size >=
          ROOMS_STORY_MILESTONES
            .length
        ) {
          this.armFinalPlacement();
        }


        return true;
      },


    /* ========================================================
       FINAL PLACEMENT OBJECTIVE
    ======================================================== */

    armFinalPlacement:
      function () {
        if (
          this.inspectedComplete ||

          this.completed ||

          this.collected.size <
            ROOMS_STORY_MILESTONES
              .length
        ) {
          return;
        }


        this.inspectedComplete =
          true;


        this.refreshFinalEntities();


        roomsStorySetVisible(
          this.placementPrompt,
          true
        );


        this.el.sceneEl.emit(
          'final-placement-ready',

          {
            target:
              ROOMS_FINAL_PLACEMENT
                .targetSelector,

            required:
              ROOMS_FINAL_ITEMS
                .map(
                  (item) =>
                    item.key
                )
          },

          false
        );


        console.log(
          'Final objective: ' +
          'place Teddy Bear, ' +
          'Hair Clipper and Picture ' +
          'on #truocbantho.'
        );
      },


    /* ========================================================
       SNAP CONFIG
    ======================================================== */

    getFinalItemConfig:
      function (
        key
      ) {
        return (
          ROOMS_FINAL_ITEMS
            .find(
              (item) =>
                item.key ===
                key
            ) ||

          null
        );
      },


    getSnapPoint:
      function (
        item,
        targetBox
      ) {
        if (
          !item ||
          !targetBox
        ) {
          return null;
        }


        const size =
          targetBox.getSize(
            new THREE.Vector3()
          );


        const center =
          targetBox.getCenter(
            new THREE.Vector3()
          );


        const fraction =
          THREE.MathUtils.clamp(
            Number(
              item.snapFraction
            ) || 0.5,

            0.08,
            0.92
          );


        let x =
          center.x;


        let z =
          center.z;


        if (
          size.x >=
          size.z
        ) {
          x =
            THREE.MathUtils
              .lerp(
                targetBox.min.x,
                targetBox.max.x,
                fraction
              );

        } else {
          z =
            THREE.MathUtils
              .lerp(
                targetBox.min.z,
                targetBox.max.z,
                fraction
              );
        }


        const surfaceY =
          roomsStoryGetTargetSurfaceY(
            this.targetEntity,
            targetBox,
            x,
            z
          );


        return {
          x,

          z,

          surfaceY:
            typeof surfaceY ===
            'number'
              ? surfaceY
              : targetBox.max.y
        };
      },


    /* ========================================================
       LOCK SNAPPED ITEM
    ======================================================== */

    lockSnappedItem:
      function (
        key,
        entity
      ) {
        if (
          !key ||
          !entity
        ) {
          return false;
        }


        roomsStoryStopItemPhysics(
          entity
        );


        this.lockedItems
          .add(
            key
          );


        entity.setAttribute(
          'data-altar-locked',
          'true'
        );


        entity.classList
          .add(
            'altar-locked'
          );


        /*
          Make it permanently ungrabbable.
        */

        if (
          entity.hasAttribute(
            'natural-grabbable'
          )
        ) {
          entity.removeAttribute(
            'natural-grabbable'
          );
        }


        this.itemHeldState
          .set(
            key,
            false
          );


        /*
          Existing quest checklist.
        */

        if (
          typeof window
            .setRoomsQuestItemChecked ===
          'function'
        ) {
          window
            .setRoomsQuestItemChecked(
              key,
              true
            );
        }


        return true;
      },


    /* ========================================================
       TRY SNAP ITEM
    ======================================================== */

    trySnapItem:
      function (
        key,
        entity
      ) {
        if (
          !this.inspectedComplete ||

          this.completed ||

          !key ||

          !entity ||

          this.lockedItems
            .has(
              key
            ) ||

          roomsStoryEntityIsGrabbed(
            entity
          )
        ) {
          return false;
        }


        if (
          !this.targetEntity
        ) {
          this.refreshFinalEntities();
        }


        const targetBox =
          roomsStoryGetModelBox(
            this.targetEntity
          );


        if (
          !targetBox ||

          !roomsStoryItemCanSnap(
            entity,
            targetBox
          )
        ) {
          return false;
        }


        const item =
          this.getFinalItemConfig(
            key
          );


        if (!item) {
          return false;
        }


        const snapPoint =
          this.getSnapPoint(
            item,
            targetBox
          );


        if (!snapPoint) {
          return false;
        }


        const itemBox =
          roomsStoryGetModelBox(
            entity
          );


        if (!itemBox) {
          return false;
        }


        const itemCenter =
          itemBox.getCenter(
            new THREE.Vector3()
          );


        const delta =
          new THREE.Vector3(
            snapPoint.x -
              itemCenter.x,

            (
              snapPoint.surfaceY +
              ROOMS_FINAL_PLACEMENT
                .snapSurfaceGap
            ) -
              itemBox.min.y,

            snapPoint.z -
              itemCenter.z
          );


        roomsStoryStopItemPhysics(
          entity
        );


        roomsStoryTranslateEntityWorld(
          entity,
          delta
        );


        roomsStoryStopItemPhysics(
          entity
        );


        this.lockSnappedItem(
          key,
          entity
        );


        const detail = {
          key,

          target:
            ROOMS_FINAL_PLACEMENT
              .targetSelector,

          position: {
            x:
              snapPoint.x,

            y:
              snapPoint.surfaceY,

            z:
              snapPoint.z
          }
        };


        /*
          monster.js listens for this.

          After two UNIQUE keys,
          standing.glb appears.
        */

        this.el.emit(
          'story-item-snapped',
          detail,
          false
        );


        this.el.sceneEl.emit(
          'story-item-snapped',
          detail,
          false
        );


        console.log(
          `Story placement: ${key} snapped and locked on #truocbantho.`
        );


        return true;
      },


    /* ========================================================
       CHECK RELEASED ITEMS
    ======================================================== */

    checkReleasedFinalItems:
      function () {
        if (
          !this.inspectedComplete ||
          this.completed
        ) {
          return;
        }


        if (
          !this.targetEntity
        ) {
          this.refreshFinalEntities();
        }


        const targetBox =
          roomsStoryGetModelBox(
            this.targetEntity
          );


        ROOMS_FINAL_ITEMS
          .forEach(
            (item) => {
              if (
                this.lockedItems
                  .has(
                    item.key
                  )
              ) {
                return;
              }


              let entity =
                this.itemEntities
                  .get(
                    item.key
                  );


              if (!entity) {
                entity =
                  roomsStoryFindFirst(
                    item.selectors
                  );


                if (
                  entity
                ) {
                  this.itemEntities
                    .set(
                      item.key,
                      entity
                    );


                  this.watchFinalItem(
                    item.key,
                    entity
                  );
                }
              }


              if (!entity) {
                return;
              }


              const held =
                roomsStoryEntityIsGrabbed(
                  entity
                );


              const wasHeld =
                this.itemHeldState
                  .get(
                    item.key
                  ) ===
                true;


              this.itemHeldState
                .set(
                  item.key,
                  held
                );


              /*
                Controller/browser fallback.
              */

              if (
                wasHeld &&
                !held
              ) {
                this.trySnapItem(
                  item.key,
                  entity
                );

                return;
              }


              /*
                Recovery if object is already sitting
                correctly when placement mode begins.
              */

              if (
                !held &&
                targetBox &&
                roomsStoryItemCanSnap(
                  entity,
                  targetBox
                )
              ) {
                const alreadyOnTarget =
                  roomsStoryItemIsOnTarget(
                    entity,
                    targetBox
                  );


                if (
                  alreadyOnTarget
                ) {
                  this.trySnapItem(
                    item.key,
                    entity
                  );
                }
              }
            }
          );
      },


    /* ========================================================
       PLACEMENT STATE
    ======================================================== */

    getPlacementState:
      function () {
        if (
          !this.targetEntity
        ) {
          this.refreshFinalEntities();
        }


        const targetBox =
          roomsStoryGetModelBox(
            this.targetEntity
          );


        const placed = {};


        ROOMS_FINAL_ITEMS
          .forEach(
            (item) => {
              let entity =
                this.itemEntities
                  .get(
                    item.key
                  );


              if (!entity) {
                entity =
                  roomsStoryFindFirst(
                    item.selectors
                  );


                if (entity) {
                  this.itemEntities
                    .set(
                      item.key,
                      entity
                    );
                }
              }


              placed[
                item.key
              ] =
                Boolean(
                  this.lockedItems
                    .has(
                      item.key
                    ) ||

                  (
                    targetBox &&

                    entity &&

                    roomsStoryItemIsOnTarget(
                      entity,
                      targetBox
                    ) &&

                    entity.getAttribute(
                      'data-altar-locked'
                    ) ===
                      'true'
                  )
                );
            }
          );


        return {
          targetFound:
            Boolean(
              this.targetEntity &&
              targetBox
            ),

          placed,

          allPlaced:
            ROOMS_FINAL_ITEMS
              .every(
                (item) =>
                  placed[
                    item.key
                  ] ===
                  true
              )
        };
      },


    /* ========================================================
       IS STANDING MONSTER EVENT STILL PENDING?

       This is the new part that prevents the third item
       from immediately ending the game.
    ======================================================== */

    standingScareIsPending:
      function () {
        const monsterState =
          window
            .roomsMonsterState;


        if (
          !monsterState
        ) {
          /*
            monster.js not loaded?
            Do NOT permanently block the story.
          */

          return false;
        }


        /*
          We only wait if the standing event really started.

          Once monster.js says standingFinished = true,
          the final story may continue.
        */

        return Boolean(
          monsterState
            .standingTriggered &&

          !monsterState
            .standingFinished
        );
      },


    /* ========================================================
       FINAL PLACEMENT CHECK
    ======================================================== */

    checkFinalPlacement:
      function (
        time
      ) {
        if (
          !this.inspectedComplete ||

          this.completed ||

          window.roomsPaused ||

          window.roomsInputLocked ||

          window.roomsInspectionOpen
        ) {
          this.allPlacedSince =
            null;


          return;
        }


        const state =
          this.getPlacementState();


        if (
          !state.targetFound ||
          !state.allPlaced
        ) {
          this.allPlacedSince =
            null;


          this.waitingForStandingScare =
            false;


          return;
        }


        /* ==================================================
           NEW:

           ALL THREE ARE PLACED,
           BUT STANDING.GLB IS STILL ACTIVE.

           Let the 3rd object stay locked on the table,
           but DO NOT trigger the ending yet.
        ================================================== */

        if (
          this.standingScareIsPending()
        ) {
          this.allPlacedSince =
            null;


          if (
            !this
              .waitingForStandingScare
          ) {
            this.waitingForStandingScare =
              true;


            console.log(
              'All 3 altar items are placed, but story is waiting for standing.glb scare to finish.'
            );


            this.el.sceneEl.emit(
              'story-waiting-for-standing-monster',

              {
                placed:
                  state.placed
              },

              false
            );
          }


          return;
        }


        /* ==================================================
           STANDING.GLB EVENT FINISHED.

           Ending is allowed again.
        ================================================== */

        if (
          this
            .waitingForStandingScare
        ) {
          this.waitingForStandingScare =
            false;


          console.log(
            'standing.glb scare finished. Final ending may continue.'
          );


          this.el.sceneEl.emit(
            'story-standing-monster-finished',

            {
              placed:
                state.placed
            },

            false
          );
        }


        /*
          Start the normal 700ms ending settle timer.
        */

        if (
          this.allPlacedSince ===
          null
        ) {
          this.allPlacedSince =
            time;


          return;
        }


        if (
          time -
          this.allPlacedSince >=
          ROOMS_FINAL_PLACEMENT
            .settleTime
        ) {
          this.completeStory(
            state
          );
        }
      },


    /* ========================================================
       STOP LIGHT FLICKERING
    ======================================================== */

    stopRoomFlicker:
      function () {
        document
          .querySelectorAll(
            '[flicker]'
          )
          .forEach(
            (entity) => {
              const flicker =
                entity.components &&
                entity.components
                  .flicker;


              /*
                Return light to stable intensity first.
              */

              if (
                flicker &&
                typeof flicker
                  .stableIntensity ===
                  'number'
              ) {
                entity.setAttribute(
                  'light',
                  'intensity',

                  flicker
                    .stableIntensity
                );
              }


              entity.removeAttribute(
                'flicker'
              );


              if (
                entity.hasAttribute(
                  'proximity-light-reaction'
                )
              ) {
                entity.removeAttribute(
                  'proximity-light-reaction'
                );
              }
            }
          );


        this.el.sceneEl.emit(
          'room-flicker-stopped',
          {},
          false
        );
      },


    /* ========================================================
       FINAL COMPLETION
    ======================================================== */

    completeStory:
      function (
        placementState
      ) {
        if (
          this.completed
        ) {
          return;
        }


        this.completed =
          true;


        this.waitingForStandingScare =
          false;


        this.allPlacedSince =
          null;


        roomsStorySetVisible(
          this.placementPrompt,
          false
        );


        this.stopRoomFlicker();


        const detail = {
          total:
            ROOMS_STORY_MILESTONES
              .length,

          inspected:
            Array.from(
              this.collected
            ),

          placed:
            placementState &&
            placementState
              .placed
              ? placementState
                  .placed
              : {},

          target:
            ROOMS_FINAL_PLACEMENT
              .targetSelector
        };


        console.log(
          'All 3 quest items are on ' +
          '#truocbantho. ' +
          'Standing scare finished. ' +
          'Story complete.'
        );


        /*
          Existing final jumpscare.
        */

        this.el.emit(
          'all-clues-collected',
          detail,
          false
        );


        this.el.sceneEl.emit(
          'story-completed',
          detail,
          false
        );


        window.roomsGameEnded =
          true;


        /*
          Give the existing final scare time.
        */

        this.endTimer =
          window.setTimeout(
            () => {
              this.showEndScreen();

              this.lockFinishedGame();
            },

            ROOMS_FINAL_PLACEMENT
              .endScreenDelay
          );
      },


    /* ========================================================
       FINAL UI
    ======================================================== */

    buildFinalUI:
      function () {
        const camera =
          document.querySelector(
            '#cam'
          ) ||

          document.querySelector(
            '[camera]'
          );


        if (!camera) {
          return;
        }


        const oldPrompt =
          document.querySelector(
            '#roomsFinalPlacementPrompt'
          );


        if (oldPrompt) {
          oldPrompt.remove();
        }


        const prompt =
          document.createElement(
            'a-entity'
          );


        prompt.setAttribute(
          'id',
          'roomsFinalPlacementPrompt'
        );


        prompt.setAttribute(
          'position',
          '0 0.26 -0.86'
        );


        prompt.setAttribute(
          'visible',
          false
        );


        const promptBack =
          document.createElement(
            'a-plane'
          );


        promptBack.setAttribute(
          'width',
          '0.58'
        );


        promptBack.setAttribute(
          'height',
          '0.085'
        );


        promptBack.setAttribute(
          'material',

          'color: #0d0f12; ' +
          'opacity: 0.78; ' +
          'transparent: true; ' +
          'shader: flat; ' +
          'depthTest: false; ' +
          'depthWrite: false'
        );


        const promptText =
          roomsStoryCreateText(
            'PLACE ALL 3 ITEMS ON THE ALTAR',

            '0 0 0.008',

            '0.56',

            'center',

            '#ffffff',

            34
          );


        prompt.append(
          promptBack,
          promptText
        );


        camera.appendChild(
          prompt
        );


        this.placementPrompt =
          prompt;



        /* =========================
           GAME COMPLETE SCREEN
        ========================= */

        const oldEnd =
          document.querySelector(
            '#roomsGameCompleteUI'
          );


        if (oldEnd) {
          oldEnd.remove();
        }


        const endRoot =
          document.createElement(
            'a-entity'
          );


        endRoot.setAttribute(
          'id',
          'roomsGameCompleteUI'
        );


        endRoot.setAttribute(
          'position',
          '0 0 -0.82'
        );


        endRoot.setAttribute(
          'visible',
          false
        );


        const blackout =
          document.createElement(
            'a-plane'
          );


        blackout.setAttribute(
          'width',
          '2.4'
        );


        blackout.setAttribute(
          'height',
          '1.5'
        );


        blackout.setAttribute(
          'position',
          '0 0 -0.02'
        );


        blackout.setAttribute(
          'material',

          'color: #000000; ' +
          'opacity: 0.88; ' +
          'transparent: true; ' +
          'shader: flat; ' +
          'depthTest: false; ' +
          'depthWrite: false'
        );


        const panel =
          document.createElement(
            'a-plane'
          );


        panel.setAttribute(
          'width',
          '0.78'
        );


        panel.setAttribute(
          'height',
          '0.32'
        );


        panel.setAttribute(
          'material',

          'color: #101216; ' +
          'opacity: 0.96; ' +
          'transparent: true; ' +
          'shader: flat; ' +
          'depthTest: false; ' +
          'depthWrite: false'
        );


        const title =
          roomsStoryCreateText(
            'ROOMS WITHIN',

            '0 0.055 0.015',

            '0.66',

            'center',

            '#ffffff',

            20
          );


        const complete =
          roomsStoryCreateText(
            'GAME COMPLETE',

            '0 -0.055 0.015',

            '0.56',

            'center',

            '#d8d8d8',

            22
          );


        endRoot.append(
          blackout,
          panel,
          title,
          complete
        );


        camera.appendChild(
          endRoot
        );


        this.endRoot =
          endRoot;
      },


    showEndScreen:
      function () {
        roomsStorySetVisible(
          this.endRoot,
          true
        );


        roomsStorySetVisible(
          document.querySelector(
            '#roomsQuestTracker'
          ),
          false
        );


        roomsStorySetVisible(
          document.querySelector(
            '#roomsActionPrompt'
          ),
          false
        );
      },


    /* ========================================================
       END GAME LOCK
    ======================================================== */

    lockFinishedGame:
      function () {
        window.roomsGameEnded =
          true;


        /*
          Don't call setRoomsPaused(true),
          because that would open pause UI.
        */

        window.roomsPaused =
          true;


        window.roomsInputLocked =
          true;


        const rig =
          document.querySelector(
            '#rig'
          );


        const leftHand =
          document.querySelector(
            '#leftHand'
          );


        if (rig) {
          rig.setAttribute(
            'movement-controls',
            'enabled',
            false
          );
        }


        if (leftHand) {
          leftHand.setAttribute(
            'blink-controls',
            'enabled',
            false
          );
        }


        this.el.sceneEl.emit(
          'rooms-game-ended',
          {},
          false
        );
      },


    /* ========================================================
       FRAME UPDATE
    ======================================================== */

    tick:
      function (
        time
      ) {
        if (
          this.completed
        ) {
          return;
        }


        if (
          time -
          this.lastPlacementCheck <
          ROOMS_FINAL_PLACEMENT
            .checkInterval
        ) {
          return;
        }


        this.lastPlacementCheck =
          time;


        /*
          Keep hover/inspection progress synchronized.
        */

        this.syncInspectionProgress();


        if (
          !this.inspectedComplete
        ) {
          return;
        }


        /*
          Objects can still snap even while
          standing.glb is active.
        */

        this.checkReleasedFinalItems();


        /*
          But completion is blocked until
          standingFinished becomes true.
        */

        this.checkFinalPlacement(
          time
        );
      },


    /* ========================================================
       CLEANUP
    ======================================================== */

    remove:
      function () {
        this.listeners
          .forEach(
            (entry) => {
              entry.target
                .removeEventListener(
                  entry.eventName,
                  entry.handler
                );
            }
          );


        this.listeners =
          [];


        this.itemReleaseListeners
          .forEach(
            (
              handler,
              entity
            ) => {
              if (
                entity &&
                entity.removeEventListener
              ) {
                entity.removeEventListener(
                  'stateremoved',
                  handler
                );
              }
            }
          );


        this.itemReleaseListeners
          .clear();


        this.pendingSnapFrames
          .forEach(
            (frame) => {
              window
                .cancelAnimationFrame(
                  frame
                );
            }
          );


        this.pendingSnapFrames
          .clear();


        if (
          this.endTimer
        ) {
          window.clearTimeout(
            this.endTimer
          );


          this.endTimer =
            null;
        }


        if (
          this.placementPrompt &&
          this.placementPrompt
            .parentNode
        ) {
          this.placementPrompt
            .remove();
        }


        if (
          this.endRoot &&
          this.endRoot
            .parentNode
        ) {
          this.endRoot
            .remove();
        }


        if (
          window.getRoomsStoryState
        ) {
          delete window
            .getRoomsStoryState;
        }
      }
  }
);