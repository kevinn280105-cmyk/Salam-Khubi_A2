/* ============================================================
   incense-smoke.js
   ROOMS WITHIN

   Soft incense smoke particle system.

   - No GLB required.
   - Begins when incense emits "incense-lit".
   - Follows incense while held.
   - Continues after incense is placed.
   - Thin near the tip.
   - More curved/turbulent higher up.
============================================================ */


/* ============================================================
   REALISTIC INCENSE SMOKE
============================================================ */

AFRAME.registerComponent(
  'realistic-incense-smoke',
  {

    schema: {

      /* Number of visible smoke puffs. */
      count: {
        default: 18
      },


      /* Overall height of smoke column. */
      height: {
        default: 1.15
      },


      /* Rising speed. */
      speed: {
        default: 0.14
      },


      /* Base smoke opacity. */
      opacity: {
        default: 0.24
      },


      /* Initial puff size. */
      size: {
        default: 0.055
      },


      /* How far smoke may drift sideways. */
      drift: {
        default: 0.14
      },


      /* Smoke colour. */
      color: {
        default: '#d0d0d0'
      }

    },


    /* ======================================================
       INIT
    ====================================================== */

    init: function () {

      this.active =
        false;


      this.particles =
        [];


      this.tipWorldPosition =
        new THREE.Vector3();


      this.smokeTexture =
        this.createSmokeTexture();


      this.startSmoke =
        this.startSmoke.bind(this);


      /*
        Find the incense stick that owns this tip.
      */

      this.incense =
        this.el.closest(
          '#incenseStick'
        );


      if (this.incense) {

        /*
          incense.js already emits this event when
          the incense successfully catches fire.
        */

        this.incense.addEventListener(

          'incense-lit',

          this.startSmoke

        );

      }


      this.createParticles();

    },


    /* ======================================================
       CREATE SOFT SMOKE TEXTURE

       Generates a blurred transparent puff using Canvas.
       No external PNG is necessary.
    ====================================================== */

    createSmokeTexture: function () {

      const canvas =
        document.createElement(
          'canvas'
        );


      canvas.width =
        128;


      canvas.height =
        128;


      const context =
        canvas.getContext(
          '2d'
        );


      const gradient =

        context.createRadialGradient(

          64,
          64,
          3,

          64,
          64,
          60

        );


      /*
        Soft white/grey centre fading to transparent.
      */

      gradient.addColorStop(

        0,

        'rgba(225,225,225,0.72)'

      );


      gradient.addColorStop(

        0.22,

        'rgba(205,205,205,0.46)'

      );


      gradient.addColorStop(

        0.55,

        'rgba(180,180,180,0.18)'

      );


      gradient.addColorStop(

        1,

        'rgba(160,160,160,0)'

      );


      context.fillStyle =
        gradient;


      context.fillRect(

        0,
        0,

        128,
        128

      );


      const texture =
        new THREE.CanvasTexture(
          canvas
        );


      texture.needsUpdate =
        true;


      return texture;

    },


    /* ======================================================
       CREATE PARTICLE POOL
    ====================================================== */

    createParticles: function () {

      const sceneObject =
        this.el.sceneEl.object3D;


      for (

        let i = 0;

        i < this.data.count;

        i++

      ) {

        const material =

          new THREE.SpriteMaterial({

            map:
              this.smokeTexture,

            color:
              new THREE.Color(
                this.data.color
              ),

            transparent:
              true,

            opacity:
              0,

            depthWrite:
              false,

            depthTest:
              true

          });


        const sprite =

          new THREE.Sprite(
            material
          );


        sprite.visible =
          false;


        /*
          Keep smoke above most transparent surfaces.
        */

        sprite.renderOrder =
          10;


        sceneObject.add(
          sprite
        );


        this.particles.push({

          sprite:
            sprite,

          material:
            material,


          /*
            Stagger particles so smoke doesn't spawn
            as one giant puff.
          */

          life:
            -(
              i /
              this.data.count
            ),


          /*
            Each particle gets slightly different motion.
          */

          phase:
            Math.random() *
            Math.PI *
            2,


          driftX:
            (
              Math.random() -
              0.5
            ) *
            this.data.drift,


          driftZ:
            (
              Math.random() -
              0.5
            ) *
            this.data.drift,


          sizeVariation:
            0.72 +
            Math.random() *
            0.55,


          rotationSpeed:
            (
              Math.random() -
              0.5
            ) *
            0.6

        });

      }

    },


    /* ======================================================
       START SMOKE

       Triggered by incense.js:
       incense-lit
    ====================================================== */

    startSmoke: function () {

      if (this.active) {
        return;
      }


      this.active =
        true;


      console.log(
        'Incense smoke started.'
      );

    },


    /* ======================================================
       RESET ONE PUFF
    ====================================================== */

    resetParticle: function (
      particle
    ) {

      particle.life =
        0;


      particle.phase =
        Math.random() *
        Math.PI *
        2;


      particle.driftX =
        (
          Math.random() -
          0.5
        ) *
        this.data.drift;


      particle.driftZ =
        (
          Math.random() -
          0.5
        ) *
        this.data.drift;


      particle.sizeVariation =
        0.72 +
        Math.random() *
        0.55;

    },


    /* ======================================================
       MAIN SMOKE ANIMATION
    ====================================================== */

    tick: function (
      time,
      deltaTime
    ) {

      if (
        !this.active ||
        !deltaTime
      ) {

        return;

      }


      /*
        Get the REAL world position of the incense tip.

        That means smoke works:
        - while holding incense
        - while moving it
        - after placing it
      */

      this.el.object3D
        .getWorldPosition(
          this.tipWorldPosition
        );


      const seconds =

        Math.min(

          deltaTime /
          1000,

          0.05

        );


      const clock =

        time *
        0.001;


      this.particles.forEach(

        (
          particle,
          index
        ) => {


          /* -----------------------------------------------
             ADVANCE LIFE
          ----------------------------------------------- */

          particle.life +=

            seconds *

            this.data.speed;


          if (
            particle.life >
            1
          ) {

            this.resetParticle(
              particle
            );

          }


          /*
            Particles that have not started yet remain hidden.
          */

          if (
            particle.life <
            0
          ) {

            particle.sprite.visible =
              false;


            return;

          }


          const life =
            particle.life;


          /* -----------------------------------------------
             VERTICAL RISE
          ----------------------------------------------- */

          const y =

            life *

            this.data.height;


          /* -----------------------------------------------
             SMOKE REGIONS

             0 → 0.25
             nearly straight

             0.25 → 0.65
             curls

             0.65 → 1
             irregular spreading
          ----------------------------------------------- */

          const middleAmount =

            THREE.MathUtils
              .smoothstep(

                life,

                0.18,

                0.7

              );


          const upperAmount =

            THREE.MathUtils
              .smoothstep(

                life,

                0.52,

                1

              );


          /* -----------------------------------------------
             VERY SMALL MOTION NEAR THE TIP
          ----------------------------------------------- */

          const lowerWaveX =

            Math.sin(

              clock *
              0.75 +

              particle.phase

            ) *

            0.006 *


            (
              1 -
              upperAmount
            );


          const lowerWaveZ =

            Math.cos(

              clock *
              0.63 +

              particle.phase

            ) *

            0.004;


          /* -----------------------------------------------
             CURLING MIDDLE SMOKE
          ----------------------------------------------- */

          const curlX =

            Math.sin(

              clock *
              1.05 +

              life *
              8 +

              particle.phase

            ) *

            0.055 *

            middleAmount;


          const curlZ =

            Math.cos(

              clock *
              0.82 +

              life *
              7 +

              particle.phase *
              1.4

            ) *

            0.04 *

            middleAmount;


          /* -----------------------------------------------
             UPPER RANDOM DRIFT
          ----------------------------------------------- */

          const upperDriftX =

            particle.driftX *

            upperAmount;


          const upperDriftZ =

            particle.driftZ *

            upperAmount;


          /* -----------------------------------------------
             SECONDARY TURBULENCE

             Keeps smoke from looking synchronized.
          ----------------------------------------------- */

          const turbulenceX =

            Math.sin(

              clock *
              1.9 +

              life *
              13 +

              particle.phase *
              2

            ) *

            0.018 *

            upperAmount;


          const turbulenceZ =

            Math.cos(

              clock *
              1.6 +

              life *
              11 +

              particle.phase *
              1.3

            ) *

            0.014 *

            upperAmount;


          /* -----------------------------------------------
             FINAL WORLD POSITION
          ----------------------------------------------- */

          particle.sprite.position.set(

            this.tipWorldPosition.x +

              lowerWaveX +

              curlX +

              upperDriftX +

              turbulenceX,


            this.tipWorldPosition.y +

              y,


            this.tipWorldPosition.z +

              lowerWaveZ +

              curlZ +

              upperDriftZ +

              turbulenceZ

          );


          /* -----------------------------------------------
             SIZE

             Smoke starts narrow and slowly expands.
          ----------------------------------------------- */

          const baseSize =

            this.data.size *

            particle.sizeVariation;


          const expansion =

            1 +

            life *
            2.4;


          const width =

            baseSize *

            expansion;


          /*
            Slightly stretched vertically so smoke
            doesn't look like circular bubbles.
          */

          particle.sprite.scale.set(

            width,

            width *
            1.55,

            1

          );


          /* -----------------------------------------------
             ROTATION
          ----------------------------------------------- */

          particle.material.rotation =

            particle.phase +

            clock *

            particle.rotationSpeed;


          /* -----------------------------------------------
             FADE

             Appears gently near tip,
             becomes clearest in middle,
             disappears at top.
          ----------------------------------------------- */

          const fadeIn =

            THREE.MathUtils
              .smoothstep(

                life,

                0,

                0.09

              );


          const fadeOut =

            1 -

            THREE.MathUtils
              .smoothstep(

                life,

                0.62,

                1

              );


          /*
            Slight irregular opacity makes smoke feel
            less computer-generated.
          */

          const opacityNoise =

            0.82 +

            Math.sin(

              clock *
              1.2 +

              particle.phase

            ) *

            0.12;


          particle.material.opacity =

            this.data.opacity *

            fadeIn *

            fadeOut *

            opacityNoise;


          particle.sprite.visible =

            particle.material.opacity >

            0.002;

        }

      );

    },


    /* ======================================================
       CLEANUP
    ====================================================== */

    remove: function () {

      if (this.incense) {

        this.incense.removeEventListener(

          'incense-lit',

          this.startSmoke

        );

      }


      const sceneObject =
        this.el.sceneEl.object3D;


      this.particles.forEach(

        (particle) => {

          sceneObject.remove(
            particle.sprite
          );


          particle.material.dispose();

        }

      );


      if (this.smokeTexture) {

        this.smokeTexture.dispose();

      }


      this.particles =
        [];

    }

  }

);