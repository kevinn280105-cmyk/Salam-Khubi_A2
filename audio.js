/* ============================================================
   audio.js — ROOMS WITHIN
   FULL REPLACEMENT

   Goals:
   - Reliable sound on Mac + Meta Quest Browser.
   - Native HTMLAudioElement ambience.
   - User-gesture audio unlock through ENABLE SOUND.
   - Distance fading for fan, rain, fluorescent hum and TV static.
   - Quieter player footsteps.
   - Pause / resume / mute support.
   - TV static follows the learned CRT screen position.
   - Clear debug information for presentation testing.
============================================================ */


/* ============================================================
   GLOBAL AUDIO STATE
============================================================ */

let roomsMasterVolume = 1.0;
let roomsMuted = false;
let roomsTVOn = false;
let roomsTVWorldPosition = null;
let roomsAudioUnlocked = false;

window.roomsMuted = roomsMuted;
window.roomsAudioUnlocked = roomsAudioUnlocked;


/* ============================================================
   SOUND DEFINITIONS

   These are estimated world positions.

   The TV position is replaced automatically by
   engine-interactions.js after the CRT screen is learned.
============================================================ */

const ROOM_SOUND_DEFINITIONS = [
  {
    id: 'fanSound',
    src: 'sounds/73347__noisecollector__noisy_ceiling_fan.mp3',
    position: new THREE.Vector3(-3.5, 2.4, -1.0),
    baseVolume: 0.24,
    fullVolumeDistance: 2.2,
    maxDistance: 11.0,
    loop: true,
    startAutomatically: true
  },

  {
    id: 'rainSound',
    src: 'sounds/bedroom-rain.wav',
    position: new THREE.Vector3(-2.0, 1.6, -3.0),
    baseVolume: 0.20,
    fullVolumeDistance: 2.5,
    maxDistance: 12.0,
    loop: true,
    startAutomatically: true
  },

  {
    id: 'fluorescentSound',
    src: 'sounds/fluorescent-light.wav',
    position: new THREE.Vector3(2.5, 2.5, 1.5),
    baseVolume: 0.14,
    fullVolumeDistance: 2.0,
    maxDistance: 9.0,
    loop: true,
    startAutomatically: true
  },

  {
    id: 'tvStaticSound',
    src: 'sounds/tv-static.mp3',
    position: new THREE.Vector3(0, 1.2, 0),
    baseVolume: 0.18,
    fullVolumeDistance: 1.6,
    maxDistance: 7.0,
    loop: true,
    startAutomatically: false
  }
];


/* ============================================================
   GENERAL HELPERS
============================================================ */

function clamp01(value) {
  return Math.max(
    0,
    Math.min(
      1,
      Number(value) || 0
    )
  );
}


function getRoomSoundDefinition(id) {
  return (
    ROOM_SOUND_DEFINITIONS.find(
      (definition) =>
        definition.id === id
    ) || null
  );
}


function getScene() {
  return document.querySelector(
    'a-scene'
  );
}


function getCameraEntity() {
  return (
    document.querySelector('#cam') ||
    document.querySelector('[camera]')
  );
}


function isRoomsPauseMenuOpen() {
  if (
    window.roomsPaused ||
    window.roomsInputLocked
  ) {
    return true;
  }

  const desktopOverlay =
    document.querySelector(
      '#screenPauseMenuOverlay'
    );

  if (
    desktopOverlay &&
    desktopOverlay.classList.contains(
      'is-open'
    )
  ) {
    return true;
  }

  const vrPanel =
    document.querySelector(
      '#vrPausePanel'
    );

  if (vrPanel) {
    const visible =
      vrPanel.getAttribute(
        'visible'
      );

    if (
      visible === true ||
      visible === 'true'
    ) {
      return true;
    }
  }

  return false;
}


function getPlayerFootstepVolume(
  baseVolume = 0.11
) {
  if (
    roomsMuted ||
    !roomsAudioUnlocked
  ) {
    return 0;
  }

  return clamp01(
    Number(baseVolume || 0) *
    roomsMasterVolume
  );
}


function getScareFootstepVolume() {
  if (
    roomsMuted ||
    !roomsAudioUnlocked
  ) {
    return 0;
  }

  return clamp01(
    0.30 *
    roomsMasterVolume
  );
}


function getMediaErrorDescription(
  audio
) {
  if (
    !audio ||
    !audio.error
  ) {
    return null;
  }

  const code =
    audio.error.code;

  if (code === 1) {
    return 'MEDIA_ERR_ABORTED';
  }

  if (code === 2) {
    return 'MEDIA_ERR_NETWORK';
  }

  if (code === 3) {
    return 'MEDIA_ERR_DECODE';
  }

  if (code === 4) {
    return 'MEDIA_ERR_SRC_NOT_SUPPORTED';
  }

  return `MEDIA_ERROR_${code}`;
}


/* ============================================================
   MANUAL DISTANCE FADING

   Volume stays at full strength inside fullVolumeDistance,
   then smoothly fades to zero at maxDistance.
============================================================ */

function getDistanceGain(
  distance,
  definition
) {
  if (!definition) {
    return 0;
  }

  const d =
    Math.max(
      0,
      Number(distance) || 0
    );

  if (
    d <=
    definition.fullVolumeDistance
  ) {
    return 1;
  }

  if (
    d >=
    definition.maxDistance
  ) {
    return 0;
  }

  const range =
    Math.max(
      0.001,
      definition.maxDistance -
      definition.fullVolumeDistance
    );

  const normalized =
    clamp01(
      (
        d -
        definition.fullVolumeDistance
      ) /
      range
    );

  /*
    Smoothstep:
    avoids a harsh linear volume edge.
  */

  const smooth =
    normalized *
    normalized *
    (
      3 -
      2 * normalized
    );

  return 1 - smooth;
}


/* ============================================================
   NATIVE AUDIO MANAGER
============================================================ */

AFRAME.registerComponent(
  'spatial-audio-manager',
  {
    init: function () {
      this.tracks =
        new Map();

      this.desiredPlaying =
        new Set();

      this.created =
        false;

      this.lastDistanceUpdate =
        0;

      this.playerWorldPosition =
        new THREE.Vector3();

      this.createTracks =
        this.createTracks.bind(
          this
        );

      this.onPauseChanged =
        this.onPauseChanged.bind(
          this
        );

      this.onVisibilityChange =
        this.onVisibilityChange.bind(
          this
        );

      this.el.addEventListener(
        'rooms-pause-changed',
        this.onPauseChanged
      );

      document.addEventListener(
        'visibilitychange',
        this.onVisibilityChange
      );

      if (
        this.el.hasLoaded
      ) {
        this.createTracks();
      } else {
        this.el.addEventListener(
          'loaded',
          this.createTracks,
          {
            once: true
          }
        );
      }
    },


    createTracks: function () {
      if (
        this.created
      ) {
        return;
      }

      this.created =
        true;

      ROOM_SOUND_DEFINITIONS
        .forEach(
          (definition) => {
            const audio =
              document.createElement(
                'audio'
              );

            audio.id =
              definition.id;

            audio.src =
              definition.src;

            audio.preload =
              'auto';

            audio.loop =
              Boolean(
                definition.loop
              );

            audio.playsInline =
              true;

            audio.setAttribute(
              'playsinline',
              ''
            );

            audio.setAttribute(
              'webkit-playsinline',
              ''
            );

            audio.volume =
              0;

            audio.style.display =
              'none';

            const track = {
              definition,
              audio,

              lastDistance:
                Infinity,

              lastGain:
                0,

              unlockSucceeded:
                false,

              loadReady:
                false,

              playError:
                null
            };

            audio.addEventListener(
              'loadeddata',
              () => {
                track.loadReady =
                  true;

                console.log(
                  `Audio loaded: ${definition.id}`
                );
              },
              {
                once: true
              }
            );

            audio.addEventListener(
              'canplay',
              () => {
                track.loadReady =
                  true;
              },
              {
                once: true
              }
            );

            audio.addEventListener(
              'error',
              () => {
                const description =
                  getMediaErrorDescription(
                    audio
                  );

                console.error(
                  `Audio failed to load: ${definition.src}`,
                  description
                );
              }
            );

            document.body.appendChild(
              audio
            );

            /*
              Explicit load helps Quest begin fetching the files
              before ENABLE SOUND is pressed.
            */

            try {
              audio.load();
            } catch (error) {
              console.warn(
                `Could not preload ${definition.id}:`,
                error
              );
            }

            this.tracks.set(
              definition.id,
              track
            );

            if (
              definition
                .startAutomatically
            ) {
              this.desiredPlaying.add(
                definition.id
              );
            }
          }
        );

      if (
        roomsTVWorldPosition
      ) {
        this.setEmitterPosition(
          'tvStaticSound',
          roomsTVWorldPosition
        );
      }

      this.updateVolumes(
        true
      );
    },


    getTrack: function (id) {
      return (
        this.tracks.get(id) ||
        null
      );
    },


    getPlayerPosition:
      function () {
        const camera =
          getCameraEntity();

        if (!camera) {
          return null;
        }

        camera.object3D
          .getWorldPosition(
            this.playerWorldPosition
          );

        return this
          .playerWorldPosition;
      },


    calculateTrackVolume:
      function (
        track,
        playerPosition
      ) {
        if (
          !track ||
          !track.definition ||
          roomsMuted ||
          !roomsAudioUnlocked ||
          isRoomsPauseMenuOpen() ||
          document.hidden
        ) {
          return 0;
        }

        const definition =
          track.definition;

        if (
          !playerPosition
        ) {
          track.lastDistance =
            null;

          track.lastGain =
            1;

          return clamp01(
            definition.baseVolume *
            roomsMasterVolume
          );
        }

        const distance =
          playerPosition
            .distanceTo(
              definition.position
            );

        const distanceGain =
          getDistanceGain(
            distance,
            definition
          );

        track.lastDistance =
          distance;

        track.lastGain =
          distanceGain;

        return clamp01(
          definition.baseVolume *
          roomsMasterVolume *
          distanceGain
        );
      },


    updateVolumes:
      function (force) {
        const playerPosition =
          this.getPlayerPosition();

        this.tracks
          .forEach(
            (track) => {
              const audio =
                track.audio;

              if (!audio) {
                return;
              }

              const targetVolume =
                this.calculateTrackVolume(
                  track,
                  playerPosition
                );

              if (
                force ||
                Math.abs(
                  audio.volume -
                  targetVolume
                ) >
                0.006
              ) {
                audio.volume =
                  targetVolume;
              }
            }
          );
      },


    playTrack:
      function (id) {
        this.desiredPlaying.add(
          id
        );

        if (
          !roomsAudioUnlocked ||
          roomsMuted ||
          isRoomsPauseMenuOpen() ||
          document.hidden
        ) {
          return false;
        }

        const track =
          this.getTrack(id);

        if (
          !track ||
          !track.audio
        ) {
          return false;
        }

        const audio =
          track.audio;

        if (
          !audio.paused
        ) {
          return true;
        }

        try {
          const promise =
            audio.play();

          if (
            promise &&
            typeof promise.then ===
              'function'
          ) {
            promise
              .then(
                () => {
                  track.playError =
                    null;
                }
              )
              .catch(
                (error) => {
                  track.playError =
                    String(
                      error &&
                      error.message
                        ? error.message
                        : error
                    );

                  console.warn(
                    `Could not start ${id}:`,
                    error
                  );
                }
              );
          }

          return true;
        } catch (error) {
          track.playError =
            String(
              error &&
              error.message
                ? error.message
                : error
            );

          console.warn(
            `Could not start ${id}:`,
            error
          );

          return false;
        }
      },


    stopTrack: function (id) {
      this.desiredPlaying.delete(
        id
      );

      const track =
        this.getTrack(id);

      if (
        !track ||
        !track.audio
      ) {
        return;
      }

      track.audio.pause();

      try {
        track.audio.currentTime =
          0;
      } catch (error) {
        /*
          Ignore seek errors before metadata exists.
        */
      }
    },


    pauseTrackWithoutChangingIntent:
      function (id) {
        const track =
          this.getTrack(id);

        if (
          !track ||
          !track.audio
        ) {
          return;
        }

        track.audio.pause();
      },


    pauseAllWithoutChangingIntent:
      function () {
        this.tracks
          .forEach(
            (track, id) => {
              this
                .pauseTrackWithoutChangingIntent(
                  id
                );
            }
          );
      },


    playNormalAmbience:
      function () {
        ROOM_SOUND_DEFINITIONS
          .forEach(
            (definition) => {
              if (
                definition
                  .startAutomatically
              ) {
                this.desiredPlaying.add(
                  definition.id
                );
              }
            }
          );

        this.applyPlaybackState();
      },


    setEmitterPosition:
      function (
        id,
        worldPosition
      ) {
        const definition =
          getRoomSoundDefinition(
            id
          );

        if (
          !definition ||
          !worldPosition
        ) {
          return;
        }

        definition.position.set(
          Number(
            worldPosition.x
          ) || 0,

          Number(
            worldPosition.y
          ) || 0,

          Number(
            worldPosition.z
          ) || 0
        );

        this.updateVolumes(
          true
        );
      },


    applyPlaybackState:
      function () {
        /*
          Make desired state explicit every time.
        */

        ROOM_SOUND_DEFINITIONS
          .forEach(
            (definition) => {
              if (
                definition
                  .startAutomatically
              ) {
                this.desiredPlaying.add(
                  definition.id
                );
              }
            }
          );

        if (
          roomsTVOn
        ) {
          this.desiredPlaying.add(
            'tvStaticSound'
          );
        } else {
          this.desiredPlaying.delete(
            'tvStaticSound'
          );

          const tvTrack =
            this.getTrack(
              'tvStaticSound'
            );

          if (
            tvTrack &&
            tvTrack.audio
          ) {
            tvTrack.audio.pause();

            try {
              tvTrack.audio.currentTime =
                0;
            } catch (error) {
              /*
                Ignore seek errors before metadata exists.
              */
            }
          }
        }

        this.updateVolumes(
          true
        );

        if (
          !roomsAudioUnlocked ||
          roomsMuted ||
          isRoomsPauseMenuOpen() ||
          document.hidden
        ) {
          this.pauseAllWithoutChangingIntent();

          return;
        }

        this.desiredPlaying
          .forEach(
            (id) => {
              this.playTrack(
                id
              );
            }
          );
      },


    onPauseChanged:
      function () {
        this.applyPlaybackState();
      },


    onVisibilityChange:
      function () {
        this.applyPlaybackState();
      },


    tick: function (time) {
      /*
        Distance calculations do not need to run at 90 Hz.

        125 ms = roughly eight spatial-volume updates per second,
        which is smooth enough while saving Quest CPU.
      */

      if (
        time -
        this.lastDistanceUpdate <
        125
      ) {
        return;
      }

      this.lastDistanceUpdate =
        time;

      this.updateVolumes(
        false
      );
    },


    remove: function () {
      this.el.removeEventListener(
        'rooms-pause-changed',
        this.onPauseChanged
      );

      document.removeEventListener(
        'visibilitychange',
        this.onVisibilityChange
      );

      this.tracks
        .forEach(
          (track) => {
            if (
              !track.audio
            ) {
              return;
            }

            track.audio.pause();

            track.audio.removeAttribute(
              'src'
            );

            try {
              track.audio.load();
            } catch (error) {
              /*
                Ignore teardown load errors.
              */
            }

            if (
              track.audio.parentNode
            ) {
              track.audio
                .parentNode
                .removeChild(
                  track.audio
                );
            }
          }
        );

      this.tracks.clear();

      this.desiredPlaying.clear();
    }
  }
);


/* ============================================================
   GET AUDIO MANAGER
============================================================ */

function getSpatialAudioManager() {
  const scene =
    getScene();

  if (!scene) {
    return null;
  }

  return (
    scene.components[
      'spatial-audio-manager'
    ] || null
  );
}


/* ============================================================
   UNLOCK ONE AUDIO ELEMENT

   Chrome / Quest Browser require playback to begin from a real
   user gesture.

   We briefly play at zero volume, then pause. This authorizes
   the element for later gameplay playback.
============================================================ */

async function unlockAudioElement(
  audio
) {
  if (!audio) {
    return false;
  }

  const previousVolume =
    audio.volume;

  const previousMuted =
    audio.muted;

  audio.muted =
    false;

  audio.volume =
    0;

  try {
    const result =
      audio.play();

    if (
      result &&
      typeof result.then ===
        'function'
    ) {
      await result;
    }

    audio.pause();

    try {
      audio.currentTime =
        0;
    } catch (error) {
      /*
        Ignore seek errors before metadata exists.
      */
    }

    audio.volume =
      previousVolume;

    audio.muted =
      previousMuted;

    return true;

  } catch (error) {
    audio.pause();

    try {
      audio.currentTime =
        0;
    } catch (seekError) {
      /*
        Ignore seek errors before metadata exists.
      */
    }

    audio.volume =
      previousVolume;

    audio.muted =
      previousMuted;

    console.warn(
      'Audio unlock failed:',
      audio.id || audio.src,
      error
    );

    return false;
  }
}


/* ============================================================
   ENABLE SOUND BUTTON
============================================================ */

async function enableSound() {
  const scene =
    getScene();

  const button =
    document.querySelector(
      '#soundButton'
    );

  if (!scene) {
    console.error(
      'Cannot enable sound: a-scene was not found.'
    );

    return false;
  }

  if (
    roomsAudioUnlocked
  ) {
    applyRoomsAudioSettings();

    if (button) {
      button.textContent =
        'SOUND ENABLED';

      button.disabled =
        true;

      window.setTimeout(
        () => {
          button.style.display =
            'none';
        },

        300
      );
    }

    return true;
  }

  if (button) {
    button.textContent =
      'STARTING SOUND...';

    button.disabled =
      true;
  }

  const manager =
    getSpatialAudioManager();

  if (!manager) {
    console.error(
      'Cannot enable sound: spatial-audio-manager is not ready.'
    );

    if (button) {
      button.textContent =
        'TRY SOUND AGAIN';

      button.disabled =
        false;
    }

    return false;
  }

  if (
    !manager.created
  ) {
    manager.createTracks();
  }

  const unlockEntries =
    [];

  manager.tracks
    .forEach(
      (track, id) => {
        if (
          track.audio
        ) {
          unlockEntries.push({
            id,

            audio:
              track.audio,

            track
          });
        }
      }
    );

  const footstep =
    document.querySelector(
      '#footstepAudio'
    );

  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );

  if (footstep) {
    unlockEntries.push({
      id:
        'footstepAudio',

      audio:
        footstep,

      track:
        null
    });
  }

  if (
    scareFootstep
  ) {
    unlockEntries.push({
      id:
        'scareFootstepAudio',

      audio:
        scareFootstep,

      track:
        null
    });
  }

  /*
    All play() calls begin from the ENABLE SOUND user action.
  */

  const results =
    await Promise.all(
      unlockEntries.map(
        async (entry) => {
          const success =
            await unlockAudioElement(
              entry.audio
            );

          if (
            entry.track
          ) {
            entry.track
              .unlockSucceeded =
              success;
          }

          return {
            id:
              entry.id,

            success
          };
        }
      )
    );

  const successCount =
    results.filter(
      (result) =>
        result.success
    ).length;

  const failureCount =
    results.length -
    successCount;


  /*
    FIX:

    Old version always marked audio as unlocked even if all
    playback attempts failed.

    Now at least one real audio element must unlock.
  */

  if (
    successCount === 0
  ) {
    roomsAudioUnlocked =
      false;

    window.roomsAudioUnlocked =
      false;

    scene.audioUnlocked =
      false;

    console.error(
      'Sound could not be unlocked. Check browser permission and sound-file paths.',

      results
    );

    if (button) {
      button.textContent =
        'TRY SOUND AGAIN';

      button.disabled =
        false;
    }

    return false;
  }


  roomsAudioUnlocked =
    true;

  window.roomsAudioUnlocked =
    true;

  scene.audioUnlocked =
    true;


  if (footstep) {
    footstep.loop =
      true;

    footstep.volume =
      getPlayerFootstepVolume();
  }


  if (
    scareFootstep
  ) {
    scareFootstep.loop =
      false;

    scareFootstep.volume =
      getScareFootstepVolume();
  }


  manager
    .playNormalAmbience();


  manager
    .applyPlaybackState();


  updateRoomsVolumeUI();


  scene.emit(
    'audio-settings-changed',

    getRoomsAudioState(),

    false
  );


  if (button) {
    button.textContent =
      'SOUND ENABLED';

    button.disabled =
      true;

    window.setTimeout(
      () => {
        button.style.display =
          'none';
      },

      900
    );
  }


  console.log(
    `Rooms Within audio enabled. ${successCount}/${results.length} audio element(s) unlocked.`,

    results
  );


  if (
    failureCount > 0
  ) {
    console.warn(
      `${failureCount} audio element(s) did not unlock. Use getRoomsAudioDebug() to identify them.`
    );
  }


  return true;
}


/* ============================================================
   TV STATE
============================================================ */

function setRoomsTVState(
  shouldBeOn
) {
  roomsTVOn =
    Boolean(
      shouldBeOn
    );

  const manager =
    getSpatialAudioManager();

  if (!manager) {
    return;
  }

  if (
    roomsTVOn
  ) {
    manager.desiredPlaying.add(
      'tvStaticSound'
    );
  } else {
    manager.desiredPlaying.delete(
      'tvStaticSound'
    );
  }

  manager.applyPlaybackState();
}


/* ============================================================
   REAL TV SOUND POSITION
============================================================ */

function setRoomsTVPosition(
  worldPosition
) {
  if (
    !worldPosition
  ) {
    return;
  }

  roomsTVWorldPosition =
    new THREE.Vector3(
      Number(
        worldPosition.x
      ) || 0,

      Number(
        worldPosition.y
      ) || 0,

      Number(
        worldPosition.z
      ) || 0
    );

  const manager =
    getSpatialAudioManager();

  if (manager) {
    manager.setEmitterPosition(
      'tvStaticSound',
      roomsTVWorldPosition
    );
  }

  console.log(
    'TV static sound position:',

    roomsTVWorldPosition
      .toArray()
      .map(
        (value) =>
          value.toFixed(
            2
          )
      )
  );
}


/* ============================================================
   MASTER VOLUME
============================================================ */

function changeRoomsVolume(
  amount
) {
  roomsMasterVolume =
    clamp01(
      roomsMasterVolume +
      Number(
        amount || 0
      )
    );

  applyRoomsAudioSettings();

  return roomsMasterVolume;
}


/* ============================================================
   MUTE / UNMUTE
============================================================ */

function toggleRoomsMute() {
  roomsMuted =
    !roomsMuted;

  window.roomsMuted =
    roomsMuted;

  applyRoomsAudioSettings();

  return roomsMuted;
}


/* ============================================================
   CURRENT AUDIO STATE
============================================================ */

function getRoomsAudioState() {
  return {
    muted:
      roomsMuted,

    volume:
      roomsMasterVolume,

    tvOn:
      roomsTVOn,

    unlocked:
      roomsAudioUnlocked
  };
}


/* ============================================================
   APPLY AUDIO SETTINGS
============================================================ */

function applyRoomsAudioSettings() {
  const manager =
    getSpatialAudioManager();

  if (manager) {
    manager.applyPlaybackState();
  }

  const footstep =
    document.querySelector(
      '#footstepAudio'
    );

  if (footstep) {
    footstep.volume =
      getPlayerFootstepVolume();

    if (
      roomsMuted ||
      !roomsAudioUnlocked ||
      isRoomsPauseMenuOpen() ||
      document.hidden
    ) {
      footstep.pause();
    }
  }

  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );

  if (
    scareFootstep
  ) {
    scareFootstep.volume =
      getScareFootstepVolume();

    if (
      roomsMuted ||
      !roomsAudioUnlocked ||
      isRoomsPauseMenuOpen() ||
      document.hidden
    ) {
      scareFootstep.pause();
    }
  }

  updateRoomsVolumeUI();

  const scene =
    getScene();

  if (scene) {
    scene.emit(
      'audio-settings-changed',

      getRoomsAudioState(),

      false
    );
  }
}


/* ============================================================
   UPDATE SOUND UI
============================================================ */

function updateRoomsVolumeUI() {
  const percent =
    Math.round(
      roomsMasterVolume *
      100
    );

  const screenVolumeLabel =
    document.querySelector(
      '#screenVolumeLabel'
    );

  if (
    screenVolumeLabel
  ) {
    screenVolumeLabel.textContent =
      `${percent}%`;
  }


  const vrVolumeLabel =
    document.querySelector(
      '#vrVolumeLabel'
    );

  if (
    vrVolumeLabel
  ) {
    vrVolumeLabel.setAttribute(
      'value',

      `${percent}%`
    );
  }


  const soundText =
    roomsMuted
      ? 'SOUND: OFF'
      : 'SOUND: ON';


  const screenSoundButton =
    document.querySelector(
      '#screenSoundButton'
    );

  if (
    screenSoundButton
  ) {
    screenSoundButton.textContent =
      soundText;
  }


  const vrSoundLabel =
    document.querySelector(
      '#vrSoundLabel'
    );

  if (
    vrSoundLabel
  ) {
    vrSoundLabel.setAttribute(
      'value',

      soundText
    );
  }
}


/* ============================================================
   PLAYER FOOTSTEPS
============================================================ */

AFRAME.registerComponent(
  'footstep-player',
  {
    schema: {
      minSpeed: {
        default:
          0.02
      },

      maxSpeed: {
        default:
          4
      },

      volume: {
        default:
          0.11
      }
    },


    init: function () {
      this.audio =
        document.querySelector(
          '#footstepAudio'
        );

      this.previousWorldPosition =
        new THREE.Vector3();

      this.currentWorldPosition =
        new THREE.Vector3();

      this.hasPreviousPosition =
        false;

      this.isPlaying =
        false;

      this.playPending =
        false;

      this.componentPaused =
        false;

      if (
        this.audio
      ) {
        this.audio.loop =
          true;

        this.audio.volume =
          getPlayerFootstepVolume(
            this.data.volume
          );
      }
    },


    stopSteps:
      function (
        resetTime = true
      ) {
        if (
          !this.audio
        ) {
          return;
        }

        this.audio.pause();

        if (
          resetTime
        ) {
          try {
            this.audio.currentTime =
              0;
          } catch (error) {
            /*
              Ignore seek errors before metadata exists.
            */
          }
        }

        this.isPlaying =
          false;

        this.playPending =
          false;
      },


    pause: function () {
      this.componentPaused =
        true;

      this.stopSteps();

      this.hasPreviousPosition =
        false;
    },


    play: function () {
      this.componentPaused =
        false;

      this.hasPreviousPosition =
        false;
    },


    startSteps:
      function () {
        if (
          !this.audio ||
          this.isPlaying ||
          this.playPending ||
          roomsMuted ||
          !roomsAudioUnlocked ||
          isRoomsPauseMenuOpen() ||
          document.hidden
        ) {
          return;
        }

        this.audio.volume =
          getPlayerFootstepVolume(
            this.data.volume
          );

        this.playPending =
          true;

        try {
          const result =
            this.audio.play();

          if (
            result &&
            typeof result.then ===
              'function'
          ) {
            result
              .then(
                () => {
                  this.playPending =
                    false;

                  this.isPlaying =
                    !this.audio.paused;
                }
              )
              .catch(
                (error) => {
                  this.playPending =
                    false;

                  this.isPlaying =
                    false;

                  console.warn(
                    'Footstep sound could not start:',

                    error
                  );
                }
              );
          } else {
            this.playPending =
              false;

            this.isPlaying =
              !this.audio.paused;
          }

        } catch (error) {
          this.playPending =
            false;

          this.isPlaying =
            false;

          console.warn(
            'Footstep sound could not start:',

            error
          );
        }
      },


    tick: function (
      time,
      deltaTime
    ) {
      if (
        !deltaTime ||
        !this.audio ||
        this.componentPaused
      ) {
        return;
      }

      if (
        roomsMuted ||
        !roomsAudioUnlocked ||
        isRoomsPauseMenuOpen() ||
        document.hidden
      ) {
        if (
          this.isPlaying ||
          this.playPending
        ) {
          this.stopSteps();
        }

        this.hasPreviousPosition =
          false;

        return;
      }

      this.el.object3D
        .getWorldPosition(
          this.currentWorldPosition
        );

      if (
        !this.hasPreviousPosition
      ) {
        this.previousWorldPosition
          .copy(
            this.currentWorldPosition
          );

        this.hasPreviousPosition =
          true;

        return;
      }

      const deltaX =
        this.currentWorldPosition.x -
        this.previousWorldPosition.x;

      const deltaZ =
        this.currentWorldPosition.z -
        this.previousWorldPosition.z;

      const distance =
        Math.hypot(
          deltaX,
          deltaZ
        );

      const speed =
        distance /
        Math.max(
          deltaTime / 1000,

          0.001
        );

      /*
        Teleports produce a huge one-frame speed.

        maxSpeed prevents a teleport from sounding like walking.
      */

      const isWalking =
        speed >=
          this.data.minSpeed &&

        speed <=
          this.data.maxSpeed;

      this.audio.volume =
        getPlayerFootstepVolume(
          this.data.volume
        );

      if (
        isWalking
      ) {
        this.startSteps();

      } else if (
        this.isPlaying ||
        this.playPending
      ) {
        this.stopSteps();
      }

      this.previousWorldPosition
        .copy(
          this.currentWorldPosition
        );
    },


    remove: function () {
      this.stopSteps();
    }
  }
);


/* ============================================================
   AUDIO DEBUG

   Browser / Quest remote console:

   getRoomsAudioDebug()
============================================================ */

function describeAudioElement(
  audio
) {
  if (
    !audio
  ) {
    return null;
  }

  return {
    id:
      audio.id || '',

    src:
      audio.currentSrc ||
      audio.src ||
      '',

    paused:
      audio.paused,

    ended:
      audio.ended,

    readyState:
      audio.readyState,

    networkState:
      audio.networkState,

    volume:
      Number(
        Number(
          audio.volume || 0
        ).toFixed(
          3
        )
      ),

    currentTime:
      Number.isFinite(
        audio.currentTime
      )
        ? Number(
          audio.currentTime
            .toFixed(
              2
            )
        )
        : null,

    error:
      getMediaErrorDescription(
        audio
      )
  };
}


function getRoomsAudioDebug() {
  const manager =
    getSpatialAudioManager();

  const tracks =
    [];

  if (
    manager
  ) {
    manager.tracks
      .forEach(
        (track, id) => {
          tracks.push({
            id,

            src:
              track.definition
                .src,

            desiredPlaying:
              manager
                .desiredPlaying
                .has(id),

            loadReady:
              Boolean(
                track.loadReady
              ),

            unlockSucceeded:
              Boolean(
                track.unlockSucceeded
              ),

            paused:
              track.audio
                .paused,

            volume:
              Number(
                track.audio
                  .volume
                  .toFixed(
                    3
                  )
              ),

            distance:
              Number.isFinite(
                track.lastDistance
              )
                ? Number(
                  track
                    .lastDistance
                    .toFixed(
                      2
                    )
                )
                : null,

            distanceGain:
              Number(
                Number(
                  track.lastGain ||
                  0
                ).toFixed(
                  3
                )
              ),

            readyState:
              track.audio
                .readyState,

            networkState:
              track.audio
                .networkState,

            mediaError:
              getMediaErrorDescription(
                track.audio
              ),

            playError:
              track.playError
          });
        }
      );
  }

  return {
    unlocked:
      roomsAudioUnlocked,

    muted:
      roomsMuted,

    masterVolume:
      roomsMasterVolume,

    tvOn:
      roomsTVOn,

    paused:
      isRoomsPauseMenuOpen(),

    documentHidden:
      document.hidden,

    managerReady:
      Boolean(
        manager
      ),

    tracks,

    footstep:
      describeAudioElement(
        document.querySelector(
          '#footstepAudio'
        )
      ),

    scareFootstep:
      describeAudioElement(
        document.querySelector(
          '#scareFootstepAudio'
        )
      )
  };
}


/* ============================================================
   PRINT AUDIO DEBUG AS A TABLE

   Console:

   printRoomsAudioDebug()
============================================================ */

function printRoomsAudioDebug() {
  const debug =
    getRoomsAudioDebug();

  console.log(
    'Rooms Within audio state:',

    {
      unlocked:
        debug.unlocked,

      muted:
        debug.muted,

      masterVolume:
        debug.masterVolume,

      tvOn:
        debug.tvOn,

      paused:
        debug.paused,

      managerReady:
        debug.managerReady
    }
  );

  if (
    debug.tracks.length
  ) {
    console.table(
      debug.tracks
    );
  }

  console.log(
    'Footstep audio:',

    debug.footstep
  );

  console.log(
    'Scare footstep audio:',

    debug.scareFootstep
  );

  return debug;
}


/* ============================================================
   GLOBAL EXPORTS
============================================================ */

window.enableSound =
  enableSound;

window.setRoomsTVState =
  setRoomsTVState;

window.setRoomsTVPosition =
  setRoomsTVPosition;

window.changeRoomsVolume =
  changeRoomsVolume;

window.toggleRoomsMute =
  toggleRoomsMute;

window.getRoomsAudioState =
  getRoomsAudioState;

window.applyRoomsAudioSettings =
  applyRoomsAudioSettings;

window.updateRoomsVolumeUI =
  updateRoomsVolumeUI;

window.getRoomsAudioDebug =
  getRoomsAudioDebug;

window.printRoomsAudioDebug =
  printRoomsAudioDebug;