/* ============================================================
   story.js — ROOMS WITHIN
   FULL REPLACEMENT
   Flow:
   1. Inspect Teddy Bear.
   2. Inspect Hair Clipper.
   3. Inspect Picture.
   4. Place all 3 physical items on #truocbantho.
   5. Lights stop flickering.
   6. Existing all-clues-collected ending/jumpscare runs.
   7. GAME COMPLETE appears and gameplay locks.
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
    title: 'TEDDY BEAR',
    snapFraction: 0.22,
    slotName: 'left',
    selectors: [
      '#teddy',
      '[data-quest-item="teddy"]'
    ]
  },

  {
    key: 'hair-clipper',
    title: 'HAIR CLIPPER',
    snapFraction: 0.78,
    slotName: 'right',
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
    title: 'PICTURE',
    snapFraction: 0.50,
    slotName: 'middle',
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

  horizontalPadding: 0.10,

  belowPadding: 0.12,

  abovePadding: 1.20,

  snapHorizontalPadding: 0.18,

  snapBelowPadding: 0.15,

  snapAbovePadding: 1.25,

  snapSurfaceGap: 0.012,

  surfaceRayExtraHeight: 1.50,

  surfaceRayExtraDepth: 3.00,

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


/*
  #truocbantho bundles the WHOLE altar-front area, not just the
  offering table: two floor rugs, a distant floor mat, and 4 small
  decorative objects already sitting on the table -- alongside the
  actual table itself. roomsStoryGetModelBox()'s bounding box over
  ALL of that is huge (about 3.2m x 6m) and mostly empty air over
  the rugs, so "is the item near the altar" and "what's the real
  surface height here" were both being measured against a zone
  that barely corresponds to the real, much smaller table -- this
  is why placing an item that visually looks like it's resting on
  the altar could fail to register, or land at the wrong height.

  Picking the mesh part with the tallest vertical extent finds the
  actual table reliably (it's the only part with real height --
  the rugs are ~1-8cm thick, the table is ~68cm) without depending
  on a specific mesh name that could change on a re-export.
*/
function roomsStoryGetAltarSurfaceBox(entity) {
  if (!entity) {
    return null;
  }

  const root = entity.getObject3D('mesh');

  if (!root) {
    return null;
  }

  entity.object3D.updateMatrixWorld(true);
  root.updateMatrixWorld(true);

  let tallestBox = null;
  let tallestHeight = -Infinity;

  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    const box = new THREE.Box3().setFromObject(node);

    if (box.isEmpty()) {
      return;
    }

    const height = box.max.y - box.min.y;

    if (height > tallestHeight) {
      tallestHeight = height;
      tallestBox = box;
    }
  });

  /*
    Should not normally happen, but never make placement worse
    than before -- fall back to the whole-model box.
  */
  return tallestBox || roomsStoryGetModelBox(entity);
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


function roomsStoryGetInspectedKeys() {
  if (
    typeof window.getRoomsQuestState !==
    'function'
  ) {
    return [];
  }

  try {
    const state =
      window.getRoomsQuestState();

    return state &&
      Array.isArray(
        state.inspected
      )
      ? state.inspected
      : [];

  } catch (error) {
    return [];
  }
}


function roomsStoryTranslateEntityWorld(
  entity,
  delta
) {
  if (
    !entity ||
    !delta
  ) {
    return false;
  }

  const parent =
    entity.object3D.parent;

  if (!parent) {
    entity.object3D.position
      .add(
        delta
      );

    return true;
  }

  const worldPosition =
    new THREE.Vector3();

  entity.object3D
    .getWorldPosition(
      worldPosition
    );

  worldPosition.add(
    delta
  );

  parent.updateMatrixWorld(
    true
  );

  entity.object3D.position
    .copy(
      parent.worldToLocal(
        worldPosition.clone()
      )
    );

  entity.object3D
    .updateMatrixWorld(
      true
    );

  return true;
}


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

  if (!grabbable) {
    return;
  }

  grabbable.isMoving =
    false;

  if (
    grabbable.velocity
  ) {
    grabbable.velocity.set(
      0,
      0,
      0
    );
  }
}


function roomsStoryReleaseItemFromHolder(
  entity
) {
  if (!entity) {
    return false;
  }

  const grabbable =
    entity.components &&
    entity.components[
      'natural-grabbable'
    ];

  if (!grabbable) {
    return true;
  }

  const holder =
    grabbable.heldBy ||
    null;

  if (
    holder &&
    holder.components
  ) {
    const hand =
      holder.components[
        'natural-grab-hand'
      ];

    if (
      hand &&
      hand.heldItem ===
        grabbable
    ) {
      hand.heldItem =
        null;
    }
  }

  if (
    grabbable.heldBy &&
    typeof grabbable.release ===
      'function'
  ) {
    grabbable.release(
      new THREE.Vector3()
    );

  } else if (
    entity.is &&
    entity.is(
      'grabbed'
    )
  ) {
    entity.removeState(
      'grabbed'
    );
  }

  roomsStoryStopItemPhysics(
    entity
  );

  return true;
}


function roomsStoryGetTargetSurfaceY(
  targetEntity,
  worldX,
  worldZ,
  targetBox
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

  const meshes =
    [];

  root.traverse(
    (node) => {
      if (
        node &&
        node.isMesh &&
        node.visible !== false
      ) {
        meshes.push(
          node
        );
      }
    }
  );

  if (
    !meshes.length
  ) {
    return targetBox.max.y;
  }

  const origin =
    new THREE.Vector3(
      worldX,

      targetBox.max.y +
        ROOMS_FINAL_PLACEMENT
          .surfaceRayExtraHeight,

      worldZ
    );

  const ray =
    new THREE.Raycaster(
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
    ray.intersectObjects(
      meshes,
      true
    );

  return (
    hits &&
    hits.length
  )
    ? hits[0].point.y
    : targetBox.max.y;
}


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


function roomsStoryIntersectionBelongsToEntity(
  intersection,
  entity
) {
  if (
    !intersection ||
    !entity
  ) {
    return false;
  }

  let element =
    intersection.el ||
    null;

  while (
    element &&
    element.tagName &&
    element.tagName
      .toLowerCase() !==
      'a-scene'
  ) {
    if (
      element === entity
    ) {
      return true;
    }

    element =
      element.parentElement;
  }

  const root =
    entity.getObject3D(
      'mesh'
    ) ||
    entity.object3D;

  let object =
    intersection.object ||
    null;

  while (object) {
    if (
      object === root
    ) {
      return true;
    }

    object =
      object.parent;
  }

  return false;
}


function roomsStoryAppendRaySelector(
  rayEntity,
  selector
) {
  if (
    !rayEntity ||
    !selector
  ) {
    return;
  }

  const data =
    rayEntity.getAttribute(
      'raycaster'
    ) || {};

  const selectors =
    String(
      data.objects || ''
    )
      .split(',')
      .map(
        (value) =>
          value.trim()
      )
      .filter(
        Boolean
      );

  if (
    !selectors.includes(
      selector
    )
  ) {
    selectors.push(
      selector
    );
  }

  rayEntity.setAttribute(
    'raycaster',
    'objects',
    selectors.join(
      ', '
    )
  );

  const component =
    rayEntity.components &&
    rayEntity.components
      .raycaster;

  /*
    FIX: this can run very early (story-manager's own init(),
    which can fire before #rightHand's raycaster component has
    finished ITS init -- the component object already exists in
    rayEntity.components at that point, but component.data isn't
    populated yet). Calling refreshObjects() on it then throws
    "Cannot read properties of undefined (reading 'objects')"
    inside A-Frame's raycaster code -- this was an UNCAUGHT
    exception that killed the rest of story-manager's init() on
    every load, silently disabling item placement entirely (this
    is the same error that's been showing up in the console this
    whole time). setAttribute() above already queues the real
    update for whenever the component actually finishes
    initializing, so it's safe to just skip the immediate
    refresh when the component isn't ready for it yet.
  */
  if (
    component &&
    component.data &&
    component.refreshObjects
  ) {
    component.refreshObjects();
  }
}


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
    init:
      function () {
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

        this.lockedItems =
          new Set();

        this.itemReleaseListeners =
          new Map();

        this.pendingSnapFrames =
          new Map();

        this.targetEntity =
          null;

        this.rightHand =
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

        this.onRightTriggerDown =
          this.onRightTriggerDown
            .bind(
              this
            );

        this.onTargetDesktopClick =
          this.onTargetDesktopClick
            .bind(
              this
            );

        this.onPlayerSatOppositeGhost =
          this.onPlayerSatOppositeGhost
            .bind(
              this
            );

        this.bindCurrentStory();

        this.buildFinalUI();

        this.refreshFinalEntities();

        this.bindPlacementControls();

        this.syncInspectionProgress();

        /*
          Placing the 3 items on the altar IS the objective --
          no separate hidden "inspect each item first" step is
          shown to the player, so make placement available right
          away instead of waiting on that legacy milestone gate.
        */
        this.armFinalPlacement();

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

                this.bindPlacementControls();

                this.syncInspectionProgress();
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

            lockedItems:
              Array.from(
                this.lockedItems
              ),

            heldItem:
              this.getHeldStoryItem()
                ? this.getHeldStoryItem()
                    .item.key
                : null,

            completed:
              this.completed
          });

        console.log(
          'Story manager ready. ' +
          'Inspect all 3 items, then ' +
          'point at #truocbantho and press Trigger to place each item.'
        );
      },


    /* ========================================================
       LISTENERS
    ======================================================== */

    listen:
      function (
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
            'Story manager: scene was not found.'
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

        this.listen(
          scene,
          'player-sat-opposite-ghost',
          this.onPlayerSatOppositeGhost
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

              if (entity) {
                this.itemEntities
                  .set(
                    item.key,
                    entity
                  );

                if (
                  entity.getAttribute(
                    'data-altar-locked'
                  ) ===
                  'true'
                ) {
                  this.lockedItems
                    .add(
                      item.key
                    );
                }

                this.bindItemReleaseSnap(
                  item,
                  entity
                );
              }
            }
          );
      },


    /* ========================================================
       CLICK / TRIGGER PLACEMENT CONTROLS
    ======================================================== */

    bindPlacementControls:
      function () {
        const rightHand =
          document.querySelector(
            '#rightHand'
          );

        if (
          rightHand &&
          rightHand !==
            this.rightHand
        ) {
          this.rightHand =
            rightHand;

          roomsStoryAppendRaySelector(
            rightHand,
            ROOMS_FINAL_PLACEMENT
              .targetSelector
          );

          this.listen(
            rightHand,
            'triggerdown',
            this.onRightTriggerDown
          );
        }

        if (
          this.targetEntity &&
          !this.targetEntity
            .__roomsStoryPlacementClickBound
        ) {
          this.targetEntity
            .__roomsStoryPlacementClickBound =
            true;

          this.listen(
            this.targetEntity,
            'click',
            this.onTargetDesktopClick
          );
        }
      },


    getHeldStoryItem:
      function () {
        const hands = [
          document.querySelector(
            '#rightHand'
          ),

          document.querySelector(
            '#leftHand'
          ),

          document.querySelector(
            '#desktopHold'
          )
        ].filter(
          Boolean
        );

        for (
          const handEntity
          of hands
        ) {
          const hand =
            handEntity.components &&
            handEntity.components[
              'natural-grab-hand'
            ];

          if (
            hand &&
            hand.heldItem &&
            hand.heldItem.el
          ) {
            const entity =
              hand.heldItem.el;

            const item =
              ROOMS_FINAL_ITEMS
                .find(
                  (candidate) =>
                    this.itemEntities
                      .get(
                        candidate.key
                      ) ===
                      entity ||

                    candidate.selectors
                      .some(
                        (selector) => {
                          try {
                            return entity
                              .matches(
                                selector
                              );

                          } catch (
                            error
                          ) {
                            return false;
                          }
                        }
                      )
                );

            if (
              item &&
              !this.lockedItems
                .has(
                  item.key
                )
            ) {
              return {
                item,
                entity,
                holder:
                  handEntity
              };
            }
          }
        }

        for (
          const item
          of ROOMS_FINAL_ITEMS
        ) {
          const entity =
            this.itemEntities
              .get(
                item.key
              ) ||

            roomsStoryFindFirst(
              item.selectors
            );

          if (!entity) {
            continue;
          }

          const grabbable =
            entity.components &&
            entity.components[
              'natural-grabbable'
            ];

          if (
            grabbable &&
            grabbable.heldBy &&
            !this.lockedItems
              .has(
                item.key
              )
          ) {
            return {
              item,
              entity,
              holder:
                grabbable.heldBy
            };
          }
        }

        return null;
      },


    canPlaceItemKey:
      function (
        key
      ) {
        return Boolean(
          this.inspectedComplete &&
          !this.completed &&
          !window.roomsPaused &&
          !window.roomsInputLocked &&
          !window.roomsInspectionOpen &&
          key &&

          ROOMS_FINAL_ITEMS
            .some(
              (item) =>
                item.key ===
                key
            ) &&

          !this.lockedItems
            .has(
              key
            )
        );
      },


    rayHitsPlacementTarget:
      function (
        rayEntity
      ) {
        if (
          !rayEntity ||
          !this.targetEntity ||
          !rayEntity.components ||
          !rayEntity.components
            .raycaster
        ) {
          return false;
        }

        const raycaster =
          rayEntity.components
            .raycaster;

        if (
          raycaster.refreshObjects
        ) {
          raycaster
            .refreshObjects();
        }

        return Boolean(
          (
            raycaster.intersections ||
            []
          ).some(
            (intersection) =>
              roomsStoryIntersectionBelongsToEntity(
                intersection,
                this.targetEntity
              )
          )
        );
      },


    onRightTriggerDown:
      function () {
        if (
          !this.inspectedComplete ||
          this.completed ||
          window.roomsPaused ||
          window.roomsInputLocked ||
          window.roomsInspectionOpen
        ) {
          return;
        }

        const held =
          this.getHeldStoryItem();

        if (
          !held ||
          !this.canPlaceItemKey(
            held.item.key
          ) ||
          !this.rayHitsPlacementTarget(
            this.rightHand
          )
        ) {
          return;
        }

        this.snapItemToSlot(
          held.item,
          held.entity,
          'controller-trigger'
        );
      },


    onTargetDesktopClick:
      function () {
        if (
          !this.inspectedComplete ||
          this.completed ||
          window.roomsPaused ||
          window.roomsInputLocked ||
          window.roomsInspectionOpen
        ) {
          return;
        }

        const scene =
          this.el.sceneEl;

        if (
          scene &&
          scene.renderer &&
          scene.renderer.xr &&
          scene.renderer.xr
            .isPresenting
        ) {
          return;
        }

        const held =
          this.getHeldStoryItem();

        if (
          !held ||
          !this.canPlaceItemKey(
            held.item.key
          )
        ) {
          return;
        }

        this.snapItemToSlot(
          held.item,
          held.entity,
          'desktop-click'
        );
      },


    syncInspectionProgress:
      function () {
        roomsStoryGetInspectedKeys()
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


    bindItemReleaseSnap:
      function (
        item,
        entity
      ) {
        if (
          !item ||
          !entity ||
          this.itemReleaseListeners
            .has(
              item.key
            )
        ) {
          return;
        }

        const handler =
          (event) => {
            const removedState =
              event &&
              event.detail
                ? String(
                    event.detail.state ||
                    event.detail ||
                    ''
                  )
                : '';

            if (
              removedState &&
              removedState !==
                'grabbed'
            ) {
              return;
            }

            if (
              this.lockedItems
                .has(
                  item.key
                ) ||
              !this.inspectedComplete ||
              this.completed
            ) {
              return;
            }

            const previousFrame =
              this.pendingSnapFrames
                .get(
                  item.key
                );

            if (
              previousFrame
            ) {
              cancelAnimationFrame(
                previousFrame
              );
            }

            const frame =
              requestAnimationFrame(
                () => {
                  this.pendingSnapFrames
                    .delete(
                      item.key
                    );

                  this.trySnapReleasedItem(
                    item,
                    entity
                  );
                }
              );

            this.pendingSnapFrames
              .set(
                item.key,
                frame
              );
          };

        entity.addEventListener(
          'stateremoved',
          handler
        );

        this.itemReleaseListeners
          .set(
            item.key,
            {
              entity,
              handler
            }
          );
      },


    trySnapReleasedItem:
      function (
        item,
        entity
      ) {
        if (
          !item ||
          !entity ||
          !this.inspectedComplete ||
          this.completed ||
          this.lockedItems
            .has(
              item.key
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
          roomsStoryGetAltarSurfaceBox(
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

        return this
          .snapItemToSlot(
            item,
            entity,
            'released-over-altar'
          );
      },


    snapItemToSlot:
      function (
        item,
        entity,
        reason
      ) {
        if (
          !item ||
          !entity ||
          !this.canPlaceItemKey(
            item.key
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
          roomsStoryGetAltarSurfaceBox(
            this.targetEntity
          );

        const itemBox =
          roomsStoryGetModelBox(
            entity
          );

        if (
          !targetBox ||
          !itemBox
        ) {
          return false;
        }

        roomsStoryReleaseItemFromHolder(
          entity
        );

        roomsStoryStopItemPhysics(
          entity
        );

        const targetSize =
          targetBox.getSize(
            new THREE.Vector3()
          );

        const targetCenter =
          targetBox.getCenter(
            new THREE.Vector3()
          );

        let worldX =
          targetCenter.x;

        let worldZ =
          targetCenter.z;

        const fraction =
          THREE.MathUtils.clamp(
            Number(
              item.snapFraction
            ) ||
            0.5,

            0.08,
            0.92
          );

        if (
          targetSize.x >=
          targetSize.z
        ) {
          worldX =
            THREE.MathUtils.lerp(
              targetBox.min.x,
              targetBox.max.x,
              fraction
            );

        } else {
          worldZ =
            THREE.MathUtils.lerp(
              targetBox.min.z,
              targetBox.max.z,
              fraction
            );
        }

        const surfaceY =
          roomsStoryGetTargetSurfaceY(
            this.targetEntity,
            worldX,
            worldZ,
            targetBox
          );

        const currentItemBox =
          roomsStoryGetModelBox(
            entity
          );

        if (
          !currentItemBox ||
          surfaceY === null
        ) {
          return false;
        }

        const currentCenter =
          currentItemBox.getCenter(
            new THREE.Vector3()
          );

        const delta =
          new THREE.Vector3(
            worldX -
              currentCenter.x,

            surfaceY +
              ROOMS_FINAL_PLACEMENT
                .snapSurfaceGap -
              currentItemBox.min.y,

            worldZ -
              currentCenter.z
          );

        roomsStoryTranslateEntityWorld(
          entity,
          delta
        );

        roomsStoryStopItemPhysics(
          entity
        );

        entity.setAttribute(
          'data-altar-locked',
          'true'
        );

        entity.classList.add(
          'altar-locked'
        );

        this.lockedItems.add(
          item.key
        );

        if (
          entity.hasAttribute(
            'natural-grabbable'
          )
        ) {
          entity.removeAttribute(
            'natural-grabbable'
          );
        }

        if (
          typeof window
            .setRoomsQuestItemChecked ===
            'function'
        ) {
          window.setRoomsQuestItemChecked(
            item.key,
            true
          );
        }

        const detail = {
          key:
            item.key,

          title:
            item.title ||
            item.key,

          slot:
            item.slotName ||
            '',

          reason:
            reason ||
            'snap',

          placedCount:
            this.lockedItems
              .size,

          total:
            ROOMS_FINAL_ITEMS
              .length
        };

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
          `${detail.title} snapped to ` +
          `${detail.slot || 'altar'} ` +
          `(${detail.placedCount}/${detail.total}).`
        );

        this.allPlacedSince =
          null;

        return true;
      },


    /* ========================================================
       INSPECTION PROGRESS
    ======================================================== */

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

        this.collected.add(
          id
        );

        const detail = {
          id,

          label:
            label ||
            id,

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
        /*
          This used to also require every item to be
          hover-inspected first (this.collected.size >=
          ROOMS_STORY_MILESTONES.length). interaction-prompts.js
          no longer completes the checklist from hovering --
          only a real placement does -- so that requirement had
          become a deadlock: nothing could ever place a first
          item, so nothing could ever collect a milestone, so
          this never armed and the altar counter stayed stuck at
          0/3 forever. Placing an item on the altar is the whole
          objective now (see interaction-prompts.js's quest
          text), so arm this unconditionally instead.
        */
        if (
          this.inspectedComplete ||
          this.completed
        ) {
          return;
        }

        this.inspectedComplete =
          true;

        this.refreshFinalEntities();

        /*
          Don't show the separate #roomsFinalPlacementPrompt
          banner here -- this now arms right at game start (see
          the fix above), so showing it immediately would put a
          second "PLACE ALL 3 ITEMS ON THE ALTAR" prompt on
          screen before -- or alongside -- the incense objective,
          which is not wanted. interaction-prompts.js's single
          quest-text HUD already sequences "light the incense"
          then "place on the altar (count/3)" correctly on its
          own, so that's the only on-screen objective indicator.
        */

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
          'Final objective: place Teddy Bear, ' +
          'Hair Clipper and Picture on #truocbantho.'
        );
      },


    /* ========================================================
       PLACEMENT DETECTION
    ======================================================== */

    getPlacementState:
      function () {
        if (
          !this.targetEntity
        ) {
          this.refreshFinalEntities();
        }

        const targetBox =
          roomsStoryGetAltarSurfaceBox(
            this.targetEntity
          );

        const placed =
          {};

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

              const locked =
                Boolean(
                  this.lockedItems
                    .has(
                      item.key
                    ) ||
                  (
                    entity &&
                    entity.getAttribute(
                      'data-altar-locked'
                    ) ===
                    'true'
                  )
                );

              if (locked) {
                this.lockedItems
                  .add(
                    item.key
                  );
              }

              placed[
                item.key
              ] =
                locked;
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

          return;
        }

        /*
          Do not let the final ending kill/pause the standing.glb
          scare before its blackout has finished.
        */
        if (
          window.roomsMonsterState &&
          window.roomsMonsterState
            .standingTriggered &&
          !window.roomsMonsterState
            .standingFinished
        ) {
          this.allPlacedSince =
            null;

          return;
        }

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
          'All 3 quest items are locked on ' +
          '#truocbantho. Story complete.'
        );

        /*
          REWARD: sitting.glb does not exist in the world
          until all 3 items are placed -- see index.html,
          where #sittingFigure starts with visible="false".
        */
        const sittingEl =
          document.querySelector(
            '#sittingFigure'
          );

        if (
          sittingEl
        ) {
          sittingEl.setAttribute(
            'visible',
            true
          );
        }

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

        /*
          NOTE: the actual GAME COMPLETE screen + input lock no
          longer happen here. All 3 items placed only unlocks the
          "Talk to the ghost" objective (see interaction-prompts.js
          updateQuestUI()) -- the player still needs to walk to
          #chair and sit down opposite #sittingFigure. The real
          ending is handled by onPlayerSatOppositeGhost() below,
          once that happens and the closing lines have played.
        */
      },


    /* ========================================================
       ENDING: SIT OPPOSITE THE GHOST

       Fires once, from #chair's 'player-sat-opposite-ghost' scene
       event (engine-interactions.js embedded-chair.sitDown()) --
       only emitted when #sittingFigure is actually visible, i.e.
       after all 3 altar items are placed. Queues the closing
       dialogue lines, then waits for them to actually finish
       being read before showing GAME COMPLETE and locking input --
       previously this fired a fixed delay after item placement,
       which could cut off before the player ever reached the
       chair.
    ======================================================== */

    onPlayerSatOppositeGhost:
      function () {
        if (
          window.roomsGameEnded
        ) {
          return;
        }

        window.roomsGameEnded =
          true;

        if (
          typeof roomsQueueDialogueLine ===
          'function'
        ) {
          roomsQueueDialogueLine(
            'Nam: I missed you so much, sister. There is so much I want to do with you and so much I want to tell you. If there is next life, I still want you as my sister.'
          );

          roomsQueueDialogueLine(
            'The sister: Thank you, now I can finally rest in peace.'
          );
        }

        const dialogueComponent =
          roomsDialogueSubtitleInstance;

        const dialogueDelay =
          dialogueComponent &&
          typeof dialogueComponent
            .estimateRemainingMs ===
            'function'
            ? dialogueComponent.estimateRemainingMs()
            : 9000;

        /*
          NOTE: this used to schedule showEndScreen() +
          lockFinishedGame() (the GAME COMPLETE screen). That is
          replaced by the walk-out ending: the ghost fades away,
          the previously-locked door opens on its own, and the
          real ending happens once the player actually walks
          through it -- see ending.js. Movement is deliberately
          left unlocked so the player can still walk to the door;
          window.roomsGameEnded is already true above, which is
          enough to pause the monster/scare systems for the
          remainder of the ending.
        */
        this.endTimer =
          window.setTimeout(
            () => {
              if (
                typeof window.roomsStartEndingSequence ===
                'function'
              ) {
                window.roomsStartEndingSequence();
              }
            },

            dialogueDelay
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
            'Âm Trạch',
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

        this.syncInspectionProgress();

        this.bindPlacementControls();

        if (
          !this.inspectedComplete
        ) {
          return;
        }

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

        this.itemReleaseListeners
          .forEach(
            (entry) => {
              if (
                entry &&
                entry.entity &&
                entry.handler
              ) {
                entry.entity
                  .removeEventListener(
                    'stateremoved',
                    entry.handler
                  );
              }
            }
          );

        this.itemReleaseListeners
          .clear();

        this.pendingSnapFrames
          .forEach(
            (frame) => {
              cancelAnimationFrame(
                frame
              );
            }
          );

        this.pendingSnapFrames
          .clear();

        if (
          this.targetEntity
        ) {
          delete this.targetEntity
            .__roomsStoryPlacementClickBound;
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


/* ============================================================
   GLOBAL STORY PLACEMENT HELPERS
============================================================ */

window.getRoomsHeldStoryItem =
  function () {
    const story =
      document.querySelector(
        '#story-manager'
      );

    const component =
      story &&
      story.components
        ? story.components[
            'story-manager'
          ]
        : null;

    if (
      !component ||
      typeof component
        .getHeldStoryItem !==
        'function'
    ) {
      return null;
    }

    const held =
      component
        .getHeldStoryItem();

    return held
      ? {
          key:
            held.item.key,

          title:
            held.item.title ||
            held.item.key
        }
      : null;
  };


window.canPlaceRoomsStoryItem =
  function (
    key
  ) {
    const story =
      document.querySelector(
        '#story-manager'
      );

    const component =
      story &&
      story.components
        ? story.components[
            'story-manager'
          ]
        : null;

    return Boolean(
      component &&
      typeof component
        .canPlaceItemKey ===
        'function' &&
      component.canPlaceItemKey(
        key
      )
    );
  };