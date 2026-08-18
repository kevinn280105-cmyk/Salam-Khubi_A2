/* ============================================================
   audio.js
   ROOMS WITHIN

   Handles:
   - Positional ambience
   - TV static
   - Real TV sound position
   - Master volume
   - Mute / unmute
   - Pause-menu audio behaviour
   - Footstep audio
============================================================ */


/* ============================================================
   GLOBAL AUDIO STATE
============================================================ */

let roomsMasterVolume = 1.0;
let roomsMuted = false;
let roomsTVOn = false;
let roomsTVWorldPosition = null;

/* ui-scare.js can use this as a fallback. */
window.roomsMuted = roomsMuted;


/* ============================================================
   SOUND DEFINITIONS
============================================================ */

const ROOM_SOUND_DEFINITIONS = [
  {
    id: 'fanSound',
    src: 'sounds/73347__noisecollector__noisy_ceiling_fan.mp3',
    position: new THREE.Vector3(-3.5, 2.4, -1),
    volume: 0.075,
    loop: true,
    startAutomatically: true,
    refDistance: 1.5,
    maxDistance: 12,
    rolloffFactor: 1.25
  },

  {
    id: 'rainSound',
    src: 'sounds/bedroom-rain.wav',
    position: new THREE.Vector3(-2, 1.6, -3),
    volume: 0.060,
    loop: true,
    startAutomatically: true,
    refDistance: 1.4,
    maxDistance: 11,
    rolloffFactor: 1.25
  },

  {
    id: 'fluorescentSound',
    src: 'sounds/fluorescent-light.wav',
    position: new THREE.Vector3(2.5, 2.5, 1.5),
    volume: 0.045,
    loop: true,
    startAutomatically: true,
    refDistance: 1.2,
    maxDistance: 9,
    rolloffFactor: 1.4
  },

  {
    id: 'tvStaticSound',
    src: 'sounds/tv-static.mp3',
    position: new THREE.Vector3(0, 1, 0),
    volume: 0.025,
    loop: true,
    startAutomatically: false,
    refDistance: 0.8,
    maxDistance: 7,
    rolloffFactor: 1.6
  }
];


/* ============================================================
   HELPERS
============================================================ */

function getRoomSoundDefinition(id) {
  return ROOM_SOUND_DEFINITIONS.find(
    (definition) => definition.id === id
  ) || null;
}


function getFinalVolume(definition) {
  if (!definition || roomsMuted) {
    return 0;
  }

  return THREE.MathUtils.clamp(
    definition.volume * roomsMasterVolume,
    0,
    1
  );
}


function isRoomsPauseMenuOpen() {
  const desktopOverlay =
    document.querySelector('#screenPauseMenuOverlay');

  if (
    desktopOverlay &&
    desktopOverlay.classList.contains('is-open')
  ) {
    return true;
  }

  const vrPanel =
    document.querySelector('#vrPausePanel');

  if (vrPanel) {
    const visible = vrPanel.getAttribute('visible');

    if (visible === true || visible === 'true') {
      return true;
    }
  }

  return false;
}


function getRoomsAudioContext() {
  try {
    if (
      typeof THREE !== 'undefined' &&
      THREE.AudioContext &&
      THREE.AudioContext.getContext
    ) {
      return THREE.AudioContext.getContext();
    }
  } catch (error) {
    console.warn(
      'Could not get THREE audio context:',
      error
    );
  }

  const scene = document.querySelector('a-scene');

  if (
    scene &&
    scene.audioListener &&
    scene.audioListener.context
  ) {
    return scene.audioListener.context;
  }

  return null;
}


function getPlayerFootstepVolume() {
  return roomsMuted
    ? 0
    : 0.18 * roomsMasterVolume;
}


function getScareFootstepVolume() {
  return roomsMuted
    ? 0
    : 0.35 * roomsMasterVolume;
}


/* ============================================================
   POSITIONAL AUDIO MANAGER
============================================================ */

AFRAME.registerComponent('spatial-audio-manager', {
  init: function () {
    this.emitters = new Map();
    this.desiredPlaying = new Set();
    this.created = false;

    this.createEmitters =
      this.createEmitters.bind(this);

    if (this.el.hasLoaded) {
      this.createEmitters();
    } else {
      this.el.addEventListener(
        'loaded',
        this.createEmitters,
        { once: true }
      );
    }
  },


  createEmitters: function () {
    if (this.created) {
      return;
    }

    this.created = true;

    ROOM_SOUND_DEFINITIONS.forEach((definition) => {
      const emitter = document.createElement('a-entity');

      emitter.setAttribute('id', definition.id);
      emitter.classList.add('spatial-sound');

      emitter.setAttribute(
        'position',
        {
          x: definition.position.x,
          y: definition.position.y,
          z: definition.position.z
        }
      );

      emitter.setAttribute(
        'sound',
        {
          src: `url(${definition.src})`,
          autoplay: false,
          loop: definition.loop,
          positional: true,
          volume: getFinalVolume(definition),
          distanceModel: 'inverse',
          refDistance: definition.refDistance,
          maxDistance: definition.maxDistance,
          rolloffFactor: definition.rolloffFactor
        }
      );

      emitter.addEventListener(
        'sound-loaded',
        () => {
          if (
            this.desiredPlaying.has(definition.id) &&
            this.el.audioUnlocked &&
            !roomsMuted &&
            !isRoomsPauseMenuOpen()
          ) {
            const sound = emitter.components.sound;

            if (sound && sound.playSound) {
              try {
                sound.playSound();
              } catch (error) {
                console.warn(
                  `Could not start ${definition.id}:`,
                  error
                );
              }
            }
          }
        }
      );

      this.el.appendChild(emitter);
      this.emitters.set(definition.id, emitter);
    });

    if (roomsTVWorldPosition) {
      this.setEmitterPosition(
        'tvStaticSound',
        roomsTVWorldPosition
      );
    }

    this.updateVolumes();
  },


  getEmitter: function (id) {
    return this.emitters.get(id) || null;
  },


  startEmitter: function (id) {
    this.desiredPlaying.add(id);

    if (
      !this.el.audioUnlocked ||
      roomsMuted ||
      isRoomsPauseMenuOpen()
    ) {
      return;
    }

    const emitter = this.getEmitter(id);

    if (!emitter) {
      return;
    }

    const sound = emitter.components.sound;

    if (!sound || !sound.playSound) {
      return;
    }

    try {
      sound.playSound();
    } catch (error) {
      console.warn(
        `Sound ${id} is not ready yet.`,
        error
      );
    }
  },


  stopEmitter: function (id) {
    this.desiredPlaying.delete(id);

    const emitter = this.getEmitter(id);

    if (!emitter) {
      return;
    }

    const sound = emitter.components.sound;

    if (!sound) {
      return;
    }

    try {
      if (sound.stopSound) {
        sound.stopSound();
      } else if (sound.pauseSound) {
        sound.pauseSound();
      }
    } catch (error) {
      console.warn(
        `Could not stop ${id}:`,
        error
      );
    }
  },


  silenceEmitterWithoutChangingIntent: function (id) {
    const emitter = this.getEmitter(id);

    if (!emitter) {
      return;
    }

    const sound = emitter.components.sound;

    if (!sound) {
      return;
    }

    try {
      if (sound.pauseSound) {
        sound.pauseSound();
      } else if (sound.stopSound) {
        sound.stopSound();
      }
    } catch (error) {
      console.warn(
        `Could not pause ${id}:`,
        error
      );
    }
  },


  playNormalAmbience: function () {
    ROOM_SOUND_DEFINITIONS.forEach((definition) => {
      if (definition.startAutomatically) {
        this.startEmitter(definition.id);
      }
    });
  },


  stopAll: function () {
    ROOM_SOUND_DEFINITIONS.forEach((definition) => {
      this.stopEmitter(definition.id);
    });
  },


  pauseAllWithoutChangingIntent: function () {
    ROOM_SOUND_DEFINITIONS.forEach((definition) => {
      this.silenceEmitterWithoutChangingIntent(
        definition.id
      );
    });
  },


  updateVolumes: function () {
    ROOM_SOUND_DEFINITIONS.forEach((definition) => {
      const emitter = this.getEmitter(definition.id);

      if (!emitter) {
        return;
      }

      emitter.setAttribute(
        'sound',
        'volume',
        getFinalVolume(definition)
      );
    });
  },


  setEmitterPosition: function (id, worldPosition) {
    const definition = getRoomSoundDefinition(id);

    if (!definition || !worldPosition) {
      return;
    }

    definition.position.set(
      Number(worldPosition.x) || 0,
      Number(worldPosition.y) || 0,
      Number(worldPosition.z) || 0
    );

    const emitter = this.getEmitter(id);

    if (!emitter) {
      return;
    }

    emitter.object3D.position.copy(
      definition.position
    );
  },


  applyPlaybackState: function () {
    this.updateVolumes();

    if (
      !this.el.audioUnlocked ||
      roomsMuted ||
      isRoomsPauseMenuOpen()
    ) {
      this.pauseAllWithoutChangingIntent();
      return;
    }

    ROOM_SOUND_DEFINITIONS.forEach((definition) => {
      if (definition.startAutomatically) {
        this.desiredPlaying.add(definition.id);
      }
    });

    if (roomsTVOn) {
      this.desiredPlaying.add('tvStaticSound');
    } else {
      this.desiredPlaying.delete('tvStaticSound');
      this.stopEmitter('tvStaticSound');
    }

    this.desiredPlaying.forEach((id) => {
      this.startEmitter(id);
    });
  }
});


/* ============================================================
   GET MANAGER
============================================================ */

function getSpatialAudioManager() {
  const scene = document.querySelector('a-scene');

  if (!scene) {
    return null;
  }

  return scene.components['spatial-audio-manager'] || null;
}


/* ============================================================
   ENABLE SOUND BUTTON
============================================================ */

async function enableSound() {
  const scene = document.querySelector('a-scene');
  const button = document.querySelector('#soundButton');

  if (!scene) {
    console.error(
      'Cannot enable sound: a-scene was not found.'
    );
    return;
  }

  if (button) {
    button.textContent = 'STARTING SOUND...';
    button.disabled = true;
  }

  const context = getRoomsAudioContext();

  if (
    context &&
    context.state === 'suspended'
  ) {
    try {
      await context.resume();
    } catch (error) {
      console.warn(
        'Audio context could not resume:',
        error
      );
    }
  }

  scene.audioUnlocked = true;

  const footstep =
    document.querySelector('#footstepAudio');

  if (footstep) {
    footstep.volume = getPlayerFootstepVolume();

    try {
      const promise = footstep.play();

      if (promise && promise.then) {
        await promise;
      }

      footstep.pause();
      footstep.currentTime = 0;
    } catch (error) {
      footstep.pause();
      footstep.currentTime = 0;
    }
  }

  const scareFootstep =
    document.querySelector('#scareFootstepAudio');

  if (scareFootstep) {
    scareFootstep.volume =
      getScareFootstepVolume();
  }

  const manager = getSpatialAudioManager();

  if (manager) {
    manager.playNormalAmbience();

    if (roomsTVOn) {
      manager.startEmitter(
        'tvStaticSound'
      );
    }

    manager.applyPlaybackState();
  }

  updateRoomsVolumeUI();

  scene.emit(
    'audio-settings-changed',
    getRoomsAudioState(),
    false
  );

  if (button) {
    button.textContent =
      'SOUND ENABLED';

    window.setTimeout(() => {
      button.style.display = 'none';
    }, 800);
  }

  console.log(
    'Rooms Within audio enabled.'
  );
}


/* ============================================================
   TV STATE
============================================================ */

function setRoomsTVState(shouldBeOn) {
  roomsTVOn = Boolean(shouldBeOn);

  const scene =
    document.querySelector('a-scene');

  const manager =
    getSpatialAudioManager();

  if (!manager) {
    return;
  }

  if (!roomsTVOn) {
    manager.stopEmitter(
      'tvStaticSound'
    );

    return;
  }

  if (
    scene &&
    scene.audioUnlocked &&
    !roomsMuted &&
    !isRoomsPauseMenuOpen()
  ) {
    manager.startEmitter(
      'tvStaticSound'
    );
  } else {
    manager.desiredPlaying.add(
      'tvStaticSound'
    );
  }
}


/* ============================================================
   REAL TV SOUND POSITION
============================================================ */

function setRoomsTVPosition(worldPosition) {
  if (!worldPosition) {
    return;
  }

  roomsTVWorldPosition =
    new THREE.Vector3(
      Number(worldPosition.x) || 0,
      Number(worldPosition.y) || 0,
      Number(worldPosition.z) || 0
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
    'TV static sound moved to real CRT position:',
    roomsTVWorldPosition
      .toArray()
      .map((value) =>
        value.toFixed(2)
      )
  );
}


/* ============================================================
   MASTER VOLUME
============================================================ */

function changeRoomsVolume(amount) {
  roomsMasterVolume =
    THREE.MathUtils.clamp(
      roomsMasterVolume +
      Number(amount || 0),
      0,
      1
    );

  applyRoomsAudioSettings();
}


/* ============================================================
   MUTE / UNMUTE
============================================================ */

function toggleRoomsMute() {
  roomsMuted = !roomsMuted;

  window.roomsMuted =
    roomsMuted;

  applyRoomsAudioSettings();

  return roomsMuted;
}


/* ============================================================
   CURRENT AUDIO STATE
============================================================ */

function getRoomsAudioState() {
  const scene =
    document.querySelector('a-scene');

  return {
    muted: roomsMuted,
    volume: roomsMasterVolume,
    tvOn: roomsTVOn,
    unlocked: Boolean(
      scene &&
      scene.audioUnlocked
    )
  };
}


/* ============================================================
   APPLY SETTINGS

   ui-scare.js calls this when you Resume.
============================================================ */

function applyRoomsAudioSettings() {
  const manager =
    getSpatialAudioManager();

  if (manager) {
    manager.applyPlaybackState();
  }

  const footstep =
    document.querySelector('#footstepAudio');

  if (footstep) {
    footstep.volume =
      getPlayerFootstepVolume();

    if (
      roomsMuted ||
      isRoomsPauseMenuOpen()
    ) {
      footstep.pause();
    }
  }

  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );

  if (scareFootstep) {
    scareFootstep.volume =
      getScareFootstepVolume();

    if (
      roomsMuted ||
      isRoomsPauseMenuOpen()
    ) {
      scareFootstep.pause();
    }
  }

  updateRoomsVolumeUI();

  const scene =
    document.querySelector('a-scene');

  if (scene) {
    scene.emit(
      'audio-settings-changed',
      getRoomsAudioState(),
      false
    );
  }
}


/* ============================================================
   UPDATE UI
============================================================ */

function updateRoomsVolumeUI() {
  const percent =
    Math.round(
      roomsMasterVolume * 100
    );

  const screenVolumeLabel =
    document.querySelector(
      '#screenVolumeLabel'
    );

  if (screenVolumeLabel) {
    screenVolumeLabel.textContent =
      `${percent}%`;
  }

  const vrVolumeLabel =
    document.querySelector(
      '#vrVolumeLabel'
    );

  if (vrVolumeLabel) {
    vrVolumeLabel.setAttribute(
      'value',
      `${percent}%`
    );
  }

  const vrMuteLabel =
    document.querySelector(
      '#vrMuteLabel'
    );

  if (vrMuteLabel) {
    vrMuteLabel.setAttribute(
      'value',
      roomsMuted
        ? 'OFF'
        : 'ON'
    );
  }


  /* NEW PAUSE MENU */

  const soundText =
    roomsMuted
      ? 'SOUND: OFF'
      : 'SOUND: ON';


  const screenSoundButton =
    document.querySelector(
      '#screenSoundButton'
    );

  if (screenSoundButton) {
    screenSoundButton.textContent =
      soundText;
  }


  const vrSoundLabel =
    document.querySelector(
      '#vrSoundLabel'
    );

  if (vrSoundLabel) {
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
        default: 0.02
      },

      maxSpeed: {
        default: 4
      },

      volume: {
        default: 0.18
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

      if (this.audio) {
        this.audio.loop = true;

        this.audio.volume =
          getPlayerFootstepVolume();
      }
    },


    stopSteps: function () {
      if (!this.audio) {
        return;
      }

      this.audio.pause();
      this.audio.currentTime = 0;

      this.isPlaying = false;
    },


    pause: function () {
      this.stopSteps();
    },


    play: function () {
      this.hasPreviousPosition =
        false;
    },


    tick: function (
      time,
      deltaTime
    ) {
      if (
        !deltaTime ||
        !this.audio
      ) {
        return;
      }


      if (
        roomsMuted ||
        isRoomsPauseMenuOpen() ||
        !this.el.sceneEl.audioUnlocked
      ) {
        if (this.isPlaying) {
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


      if (!this.hasPreviousPosition) {
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
        Math.sqrt(
          deltaX * deltaX +
          deltaZ * deltaZ
        );


      const speed =
        distance /
        Math.max(
          deltaTime / 1000,
          0.001
        );


      const isWalking =
        speed >=
          this.data.minSpeed &&
        speed <=
          this.data.maxSpeed;


      this.audio.volume =
        roomsMuted
          ? 0
          : this.data.volume *
            roomsMasterVolume;


      if (
        isWalking &&
        !this.isPlaying
      ) {
        const playPromise =
          this.audio.play();

        if (
          playPromise &&
          playPromise.catch
        ) {
          playPromise.catch(
            (error) => {
              console.warn(
                'Footstep sound could not start:',
                error
              );
            }
          );
        }

        this.isPlaying = true;

      } else if (
        !isWalking &&
        this.isPlaying
      ) {
        this.stopSteps();
      }


      this.previousWorldPosition
        .copy(
          this.currentWorldPosition
        );
    }
  }
);


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