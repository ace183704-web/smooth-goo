import * as dat from 'dat.gui';
const datGUI = (dat as any).GUI || (dat as any).default?.GUI || (dat as any).default;

export function initFluid(canvas: HTMLCanvasElement, onReady?: (api: any) => void) {
    let config = {
        SIM_RESOLUTION: 256,
        DYE_RESOLUTION: 1024,
        CAPTURE_RESOLUTION: 512,
        DENSITY_DISSIPATION: 0.8,
        VELOCITY_DISSIPATION: 0.1,
        PRESSURE: 0.9,
        PRESSURE_ITERATIONS: 25,
        CURL: 7,
        SPLAT_RADIUS: 0.5,
        SPLAT_FORCE: 8000,
        SHADING: true,
        COLORFUL: true,
        COLOR_UPDATE_SPEED: 4,
        PAUSED: false,
        BACK_COLOR: { r: 5, g: 3, b: 0 },
        TRANSPARENT: false,
        BLOOM: true,
        BLOOM_ITERATIONS: 7,
        BLOOM_RESOLUTION: 256,
        BLOOM_INTENSITY: 1.5,
        BLOOM_THRESHOLD: 0.4,
        BLOOM_SOFT_KNEE: 0.8,
        SUNRAYS: true,
        SUNRAYS_RESOLUTION: 196,
        SUNRAYS_WEIGHT: 1.5,
        CYCLES_TO_UPDATE: 10,
        CYCLE_INTERVAL: 200,
        MAX_ACTIVE_SPLATS: 2,
        DEMO_MODE: true,
        DEMO_INTERVAL: 600,
        DEMO_STROKE_LENGTH: 50,
        DEMO_STROKE_DURATION: 700,
        DEMO_CURVE_INTENSITY: 0.6,
        DEMO_SWING: true,
        DEMO_SWING_AMOUNT: 0.4,
        DEMO_CONFIG_CYCLING: true,
        DEMO_CONFIG_CYCLE_INTERVAL: 3000,
        DEMO_CONFIG_SELECTED: 'auto',
        DEMO_CONFIG_SHOW_NAME: false,
        AUDIO_ENABLED: true,
        RECORDING: false,
        RECORDING_FPS: 60,
        RECORDING_DURATION: 10,
        RECORDING_BITRATE: 35,
        FULLSCREEN: false,
        CAUSTICS: true,
        REFLECT_INTENSITY: 0.8,
        LIGHT_ANGLE: 0.5,
        COLOR_PALETTE: 'Liquid Gold',
    };

    function pointerPrototype() {
        this.id = -1;
        this.texcoordX = 0;
        this.texcoordY = 0;
        this.prevTexcoordX = 0;
        this.prevTexcoordY = 0;
        this.deltaX = 0;
        this.deltaY = 0;
        this.down = false;
        this.moved = false;
        this.color = [30, 0, 300];
    }
    
    // @ts-ignore
    let pointers: any[] = [];
    let splatStack: number[] = [];
    // @ts-ignore
    pointers.push(new pointerPrototype());

    let demoInterval: any = null;
    let activeMoveIntervals: any[] = [];
    let demoConfigInterval: any = null;
    let currentConfigIndex = 0;
    const demoConfigFiles: string[] = [];
    let mediaRecorder: any = null;
    let recordedChunks: any[] = [];
    let recordingStream: any = null;
    let recordingTimeout: any = null;
    let screenshotInterval: any = null;
    let screenshotCount = 0;
    let gui: any;

    function isMobile() {
        return /Mobi|Android/i.test(navigator.userAgent);
    }
    
    function getWebGLContext(canvas: HTMLCanvasElement) {
        const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
        let gl = (canvas.getContext('webgl2', params) as WebGL2RenderingContext);
        const isWebGL2 = !!gl;
        if (!isWebGL2)
            gl = (canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params)) as any;

        let halfFloat;
        let supportLinearFiltering;
        
        if (!gl) {
            throw new Error('WebGL is not supported in this browser.');
        }

        if (isWebGL2) {
            gl.getExtension('EXT_color_buffer_float');
            supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
        } else {
            halfFloat = gl.getExtension('OES_texture_half_float');
            supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
        }
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat?.HALF_FLOAT_OES;
        let formatRGBA;
        let formatRG;
        let formatR;

        if (isWebGL2) {
            formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
            formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
            formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
        } else {
            formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
            formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
            formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        }
        return { gl, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
    }

    function supportRenderTextureFormat(gl: any, internalFormat: any, format: any, type: any) {
        let texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
        let fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        return status == gl.FRAMEBUFFER_COMPLETE;
    }

    function getSupportedFormat(gl: any, internalFormat: any, format: any, type: any): any {
        if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
            switch (internalFormat) {
                case gl.R16F:
                    return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
                case gl.RG16F:
                    return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
                default:
                    return null;
            }
        }
        return { internalFormat, format };
    }

    const { gl, ext } = getWebGLContext(canvas);

    if (isMobile()) {
        config.DYE_RESOLUTION = 256;
        config.SIM_RESOLUTION = 64;
        config.BLOOM = false;
        config.SUNRAYS = false;
        config.SHADING = false;
        config.PRESSURE_ITERATIONS = 15;
    }
    if (!ext.supportLinearFiltering) {
        config.DYE_RESOLUTION = 256;
        config.SHADING = false;
        config.BLOOM = false;
        config.SUNRAYS = false;
    }

    function startGUI() {
        if (!datGUI) return;
        gui = new datGUI({ width: 300 });
        gui.add(config, 'CYCLES_TO_UPDATE', 0, 60).name('cycles to update').step(1);
        gui.add(config, 'CYCLE_INTERVAL', 0, 200).name('cycle interval').step(1);
        gui.add(config, 'MAX_ACTIVE_SPLATS', 0, 10).name('max active splats').step(1);
        gui.add(config, 'DYE_RESOLUTION', { 'very high': 2048, 'high': 1024, 'medium': 512, 'low': 256, 'very low': 128 }).name('quality').onFinishChange(initFramebuffers);
        gui.add(config, 'SIM_RESOLUTION', { '32': 32, '64': 64, '128': 128, '256': 256, '512': 512 }).name('sim resolution').onFinishChange(initFramebuffers);
        gui.add(config, 'DENSITY_DISSIPATION', 0, 4.0).name('density diffusion');
        gui.add(config, 'VELOCITY_DISSIPATION', 0, 4.0).name('velocity diffusion');
        gui.add(config, 'PRESSURE', 0.0, 1.0).name('pressure');
        gui.add(config, 'CURL', 0, 50).name('vorticity').step(1);
        gui.add(config, 'SPLAT_RADIUS', 0.01, 1.0).name('splat radius');
        gui.add(config, 'SHADING').name('shading').onFinishChange(updateKeywords);
        gui.add(config, 'COLORFUL').name('colorful');
        gui.add(config, 'PAUSED').name('paused').listen();
        gui.add({ fun: () => { splatStack.push(parseInt((Math.random() * 20).toString()) + 5); } }, 'fun').name('Random splats');
        
        let demoFolder = gui.addFolder('Demo Mode');
        demoFolder.add(config, 'DEMO_MODE').name('enabled').onFinishChange(toggleDemoMode);
        demoFolder.add(config, 'DEMO_INTERVAL', 50, 5000).name('stroke interval (ms)').step(50).onFinishChange(() => { if (config.DEMO_MODE) startDemoMode(); });
        demoFolder.add(config, 'DEMO_STROKE_LENGTH', 1, 100).name('max stroke length (%)').step(1);
        demoFolder.add(config, 'DEMO_STROKE_DURATION', 50, 1000).name('stroke duration (ms)').step(50).onFinishChange(() => { if (config.DEMO_MODE) startDemoMode(); });
        demoFolder.add(config, 'DEMO_CURVE_INTENSITY', 0, 1).name('curve intensity').step(0.1);
        demoFolder.add(config, 'DEMO_SWING').name('swing variation').onFinishChange(() => { if (config.DEMO_MODE) startDemoMode(); });
        demoFolder.add(config, 'DEMO_SWING_AMOUNT', 0, 1).name('swing amount').step(0.1).onFinishChange(() => { if (config.DEMO_MODE) startDemoMode(); });
        demoFolder.add(config, 'DEMO_CONFIG_CYCLING').name('config cycling').onFinishChange(toggleDemoConfigCycling);
        demoFolder.add(config, 'DEMO_CONFIG_CYCLE_INTERVAL', 5000, 120000).name('config cycle interval (ms)').step(1000).onFinishChange(() => { if (config.DEMO_CONFIG_CYCLING) startDemoConfigCycling(); });
        const configOptions: any = { 'auto': 'Auto Cycle' };
        // @ts-ignore
        window.demoConfigSelectionControl = demoFolder.add(config, 'DEMO_CONFIG_SELECTED', configOptions).name('selected config').onFinishChange(loadSelectedDemoConfig);
        demoFolder.add(config, 'DEMO_CONFIG_SHOW_NAME').name('show config name on load');

        let paletteFolder = gui.addFolder('Color Palette');
        paletteFolder.add(config, 'COLOR_PALETTE', ['Liquid Gold', 'Rose Gold', 'White Gold', 'Cosmic', 'Neon', 'Ocean', 'Volcanic', 'Cyberpunk', 'Rainbow']).name('Palette');
        paletteFolder.add(config, 'CAUSTICS').name('caustics effect').onFinishChange(updateKeywords);
        paletteFolder.add(config, 'REFLECT_INTENSITY', 0.0, 2.0).name('reflection intensity');
        paletteFolder.add(config, 'LIGHT_ANGLE', 0.0, 1.0).name('light rotation').step(0.01);

        let audioFolder = gui.addFolder('Audio');
        audioFolder.add(config, 'AUDIO_ENABLED').name('enabled').onFinishChange(() => {
            if (config.AUDIO_ENABLED) { startSimulation(); } else {
                if (audioContext) { audioContext.close(); audioContext = null as any; analyser = null; microphone = null; dataArray = null; }
            }
        });

        let bloomFolder = gui.addFolder('Bloom');
        bloomFolder.add(config, 'BLOOM').name('enabled').onFinishChange(updateKeywords);
        bloomFolder.add(config, 'BLOOM_INTENSITY', 0.1, 2.0).name('intensity');
        bloomFolder.add(config, 'BLOOM_THRESHOLD', 0.0, 1.0).name('threshold');

        let sunraysFolder = gui.addFolder('Sunrays');
        sunraysFolder.add(config, 'SUNRAYS').name('enabled').onFinishChange(updateKeywords);
        sunraysFolder.add(config, 'SUNRAYS_WEIGHT', 0.3, 1.0).name('weight');

        let captureFolder = gui.addFolder('Capture');
        captureFolder.addColor(config, 'BACK_COLOR').name('background color');
        captureFolder.add(config, 'TRANSPARENT').name('transparent');
        captureFolder.add({ fun: captureScreenshot }, 'fun').name('take screenshot');
        
        if (isMobile()) gui.close();
    }
    
    function applySwing(baseValue: number, minValue = 0, maxValue = Infinity) {
        if (!config.DEMO_SWING || config.DEMO_SWING_AMOUNT === 0) return baseValue;
        const variation = (Math.random() - 0.5) * 2 * config.DEMO_SWING_AMOUNT;
        const swingValue = baseValue * (1 + variation);
        return Math.max(minValue, Math.min(maxValue, swingValue));
    }

    function createDemoStroke() {
        if (!config.DEMO_MODE || config.PAUSED) return;
        const swingLength = applySwing(config.DEMO_STROKE_LENGTH, 1, 100);
        const swingDuration = applySwing(config.DEMO_STROKE_DURATION, 50, 1000);
        const swingCurveIntensity = applySwing(config.DEMO_CURVE_INTENSITY, 0, 1);
        const startX = Math.random();
        const startY = Math.random();
        // Golden elegant swirls using full range of angles
        const angle = Math.random() * 2 * Math.PI;
        const maxDistance = (swingLength / 100) * Math.min(canvas.width, canvas.height);
        const normalizedDistance = maxDistance / Math.max(canvas.width, canvas.height);
        const distance = Math.random() * normalizedDistance;
        const endX = Math.max(0, Math.min(1, startX + Math.cos(angle) * distance));
        const endY = Math.max(0, Math.min(1, startY + Math.sin(angle) * distance));
        const shouldCurve = swingCurveIntensity > 0 && Math.random() > 0.3;
        const curveAngle = shouldCurve ? angle + (Math.random() - 0.5) * Math.PI * swingCurveIntensity : angle;
        const midDistance = distance * (0.3 + Math.random() * 0.4);
        const controlX = Math.max(0, Math.min(1, startX + Math.cos(curveAngle) * midDistance));
        const controlY = Math.max(0, Math.min(1, startY + Math.sin(curveAngle) * midDistance));
        // @ts-ignore
        const newDemoPointer = new pointerPrototype();
        newDemoPointer.id = -2;
        newDemoPointer.down = true;
        newDemoPointer.moved = false;
        newDemoPointer.texcoordX = startX;
        newDemoPointer.texcoordY = startY;
        newDemoPointer.prevTexcoordX = startX;
        newDemoPointer.prevTexcoordY = startY;
        newDemoPointer.deltaX = 0;
        newDemoPointer.deltaY = 0;
        newDemoPointer.color = generateColor();
        pointers.push(newDemoPointer);
        const steps = Math.max(5, Math.floor(swingDuration / 16));
        const stepDuration = swingDuration / steps;
        let currentStep = 0;
        const moveInterval = setInterval(() => {
            if (currentStep >= steps || !config.DEMO_MODE || config.PAUSED) {
                clearInterval(moveInterval);
                const index = activeMoveIntervals.indexOf(moveInterval);
                if (index > -1) activeMoveIntervals.splice(index, 1);
                newDemoPointer.down = false;
                updatePointerUpData(newDemoPointer);
                return;
            }
            const progress = currentStep / steps;
            const t = progress;
            const currentX = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * controlX + t * t * endX;
            const currentY = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * controlY + t * t * endY;
            newDemoPointer.prevTexcoordX = newDemoPointer.texcoordX;
            newDemoPointer.prevTexcoordY = newDemoPointer.texcoordY;
            newDemoPointer.texcoordX = currentX;
            newDemoPointer.texcoordY = currentY;
            newDemoPointer.deltaX = correctDeltaX(newDemoPointer.texcoordX - newDemoPointer.prevTexcoordX);
            newDemoPointer.deltaY = correctDeltaY(newDemoPointer.texcoordY - newDemoPointer.prevTexcoordY);
            newDemoPointer.moved = Math.abs(newDemoPointer.deltaX) > 0 || Math.abs(newDemoPointer.deltaY) > 0;
            newDemoPointer.deltaX *= 2.0;
            newDemoPointer.deltaY *= 2.0;
            currentStep++;
        }, stepDuration);
        activeMoveIntervals.push(moveInterval);
    }

    function startDemoMode() {
        if (demoInterval) clearInterval(demoInterval);
        if (config.DEMO_MODE) {
            const createStrokeWithSwing = () => {
                createDemoStroke();
                const nextInterval = applySwing(config.DEMO_INTERVAL, 50, 5000);
                demoInterval = setTimeout(createStrokeWithSwing, nextInterval);
            };
            createStrokeWithSwing();
        }
    }

    function stopDemoMode() {
        if (demoInterval) { clearTimeout(demoInterval); demoInterval = null; }
        activeMoveIntervals.forEach(interval => clearInterval(interval));
        activeMoveIntervals = [];
        for (let i = pointers.length - 1; i >= 0; i--) {
            if (pointers[i].id === -2) pointers.splice(i, 1);
        }
    }

    function toggleDemoMode() {
        if (config.DEMO_MODE) startDemoMode();
        else stopDemoMode();
    }

    async function loadDemoConfigs() { return true; }
    
    async function loadDemoConfig(filename: string) { return true; }
    
    function cycleToNextDemoConfig() {}
    function startDemoConfigCycling() {}
    function stopDemoConfigCycling() {}
    function toggleDemoConfigCycling() {}
    function loadSelectedDemoConfig() {}

    function startRecording() {}
    function stopRecording() {}
    function toggleRecording() {}
    function captureScreenshot() {}
    
    // WebGL implementations 
    class Material {
        vertexShader: any;
        fragmentShaderSource: any;
        programs: any;
        activeProgram: any;
        uniforms: any;
        constructor(vertexShader: any, fragmentShaderSource: any) {
            this.vertexShader = vertexShader;
            this.fragmentShaderSource = fragmentShaderSource;
            this.programs = [];
            this.activeProgram = null;
            this.uniforms = [];
        }
        setKeywords(keywords: string[]) {
            let hash = 0;
            for (let i = 0; i < keywords.length; i++) hash += hashCode(keywords[i]);
            let program = this.programs[hash];
            if (program == null) {
                let fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
                program = createProgram(this.vertexShader, fragmentShader);
                this.programs[hash] = program;
            }
            if (program == this.activeProgram) return;
            this.uniforms = getUniforms(program);
            this.activeProgram = program;
        }
        bind() {
            gl.useProgram(this.activeProgram);
        }
    }

    class Program {
        program: any;
        uniforms: any;
        constructor(vertexShader: any, fragmentShader: any) {
            this.uniforms = {};
            this.program = createProgram(vertexShader, fragmentShader);
            this.uniforms = getUniforms(this.program);
        }
        bind() {
            gl.useProgram(this.program);
        }
    }

    function createProgram(vertexShader: any, fragmentShader: any) {
        let program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.trace(gl.getProgramInfoLog(program));
        return program;
    }

    function getUniforms(program: any) {
        let uniforms: any = [];
        let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            let uniformName = gl.getActiveUniform(program, i).name;
            uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
        }
        return uniforms;
    }

    function compileShader(type: any, source: string, keywords?: string[] | null) {
        source = addKeywords(source, keywords);
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.trace(gl.getShaderInfoLog(shader));
        return shader;
    }

    function addKeywords(source: string, keywords: string[] | null | undefined) {
        if (keywords == null) return source;
        let keywordsString = '';
        keywords.forEach(keyword => { keywordsString += '#define ' + keyword + '\n'; });
        return keywordsString + source;
    }

    const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
        precision highp float;
        attribute vec2 aPosition;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform vec2 texelSize;
        void main () {
            vUv = aPosition * 0.5 + 0.5;
            vL = vUv - vec2(texelSize.x, 0.0);
            vR = vUv + vec2(texelSize.x, 0.0);
            vT = vUv + vec2(0.0, texelSize.y);
            vB = vUv - vec2(0.0, texelSize.y);
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `);

    const blurVertexShader = compileShader(gl.VERTEX_SHADER, `
        precision highp float;
        attribute vec2 aPosition;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        uniform vec2 texelSize;
        void main () {
            vUv = aPosition * 0.5 + 0.5;
            float offset = 1.33333333;
            vL = vUv - texelSize * offset;
            vR = vUv + texelSize * offset;
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `);

    const blurShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        uniform sampler2D uTexture;
        void main () {
            vec4 sum = texture2D(uTexture, vUv) * 0.29411764;
            sum += texture2D(uTexture, vL) * 0.35294117;
            sum += texture2D(uTexture, vR) * 0.35294117;
            gl_FragColor = sum;
        }
    `);

    const copyShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        uniform sampler2D uTexture;
        void main () {
            gl_FragColor = texture2D(uTexture, vUv);
        }
    `);

    const clearShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        uniform sampler2D uTexture;
        uniform float value;
        void main () {
            gl_FragColor = value * texture2D(uTexture, vUv);
        }
    `);

    const colorShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        uniform vec4 color;
        void main () {
            gl_FragColor = color;
        }
    `);

    const checkerboardShader = compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform float aspectRatio;
        #define SCALE 25.0
        void main () {
            vec2 uv = floor(vUv * SCALE * vec2(aspectRatio, 1.0));
            float v = mod(uv.x + uv.y, 2.0);
            v = v * 0.1 + 0.8;
            gl_FragColor = vec4(vec3(v), 1.0);
        }
    `);

    const displayShaderSource = `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uTexture;
        uniform sampler2D uBloom;
        uniform sampler2D uSunrays;
        uniform vec2 texelSize;
        uniform float reflectIntensity;
        uniform float lightAngle;
        void main () {
            vec3 c = texture2D(uTexture, vUv).rgb;
        #ifdef SHADING
            vec3 lc = texture2D(uTexture, vL).rgb;
            vec3 rc = texture2D(uTexture, vR).rgb;
            vec3 tc = texture2D(uTexture, vT).rgb;
            vec3 bc = texture2D(uTexture, vB).rgb;
            float dx = length(rc) - length(lc);
            float dy = length(tc) - length(bc);
            vec3 n = normalize(vec3(dx, dy, length(texelSize)));
            
            #ifdef CAUSTICS
                float angle = lightAngle * 6.2831853;
                vec3 l = normalize(vec3(cos(angle), sin(angle), 1.0));
            #else
                vec3 l = vec3(0.0, 0.0, 1.0);
            #endif

            float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
            c *= diffuse;
            
            #ifdef CAUSTICS
                vec3 viewDir = vec3(0.0, 0.0, 1.0);
                vec3 reflectDir = reflect(-l, n);
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
                float caustics = max(0.0, 1.0 - length(n.xy) * 5.0);
                c += (vec3(1.0, 0.9, 0.6) * spec * reflectIntensity) + (c * caustics * 0.5 * reflectIntensity);
            #endif
        #endif
        #ifdef BLOOM
            vec3 bloom = texture2D(uBloom, vUv).rgb;
        #endif
        #ifdef SUNRAYS
            float sunrays = texture2D(uSunrays, vUv).r;
            c *= sunrays;
        #ifdef BLOOM
            bloom *= sunrays;
        #endif
        #endif
        #ifdef BLOOM
            c += bloom;
        #endif
            float a = max(c.r, max(c.g, c.b));
            gl_FragColor = vec4(c, a);
        }
    `;

    const bloomPrefilterShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec3 curve;
        uniform float threshold;
        void main () {
            vec3 c = texture2D(uTexture, vUv).rgb;
            float br = max(c.r, max(c.g, c.b));
            float rq = clamp(br - curve.x, 0.0, curve.y);
            rq = curve.z * rq * rq;
            c *= max(rq, br - threshold) / max(br, 0.0001);
            gl_FragColor = vec4(c, 0.0);
        }
    `);

    const bloomBlurShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uTexture;
        void main () {
            vec4 sum = vec4(0.0);
            sum += texture2D(uTexture, vL);
            sum += texture2D(uTexture, vR);
            sum += texture2D(uTexture, vT);
            sum += texture2D(uTexture, vB);
            sum *= 0.25;
            gl_FragColor = sum;
        }
    `);

    const bloomFinalShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uTexture;
        uniform float intensity;
        void main () {
            vec4 sum = vec4(0.0);
            sum += texture2D(uTexture, vL);
            sum += texture2D(uTexture, vR);
            sum += texture2D(uTexture, vT);
            sum += texture2D(uTexture, vB);
            sum *= 0.25;
            gl_FragColor = sum * intensity;
        }
    `);

    const sunraysMaskShader = compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        void main () {
            vec4 c = texture2D(uTexture, vUv);
            float br = max(c.r, max(c.g, c.b));
            c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
            gl_FragColor = c;
        }
    `);

    const sunraysShader = compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform float weight;
        #define ITERATIONS 16
        void main () {
            float Density = 0.3;
            float Decay = 0.95;
            float Exposure = 0.7;
            vec2 coord = vUv;
            vec2 dir = vUv - 0.5;
            dir *= 1.0 / float(ITERATIONS) * Density;
            float illuminationDecay = 1.0;
            float color = texture2D(uTexture, vUv).a;
            for (int i = 0; i < ITERATIONS; i++) {
                coord -= dir;
                float col = texture2D(uTexture, coord).a;
                color += col * illuminationDecay * weight;
                illuminationDecay *= Decay;
            }
            gl_FragColor = vec4(color * Exposure, 0.0, 0.0, 1.0);
        }
    `);

    const splatShader = compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTarget;
        uniform float aspectRatio;
        uniform vec3 color;
        uniform vec2 point;
        uniform float radius;
        void main () {
            vec2 p = vUv - point.xy;
            p.x *= aspectRatio;
            vec3 splat = exp(-dot(p, p) / radius) * color;
            vec3 base = texture2D(uTarget, vUv).xyz;
            gl_FragColor = vec4(base + splat, 1.0);
        }
    `);

    const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform vec2 dyeTexelSize;
        uniform float dt;
        uniform float dissipation;
        vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
            vec2 st = uv / tsize - 0.5;
            vec2 iuv = floor(st);
            vec2 fuv = fract(st);
            vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
            vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
            vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
            vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
            return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
        }
        void main () {
        #ifdef MANUAL_FILTERING
            vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
            vec4 result = bilerp(uSource, coord, dyeTexelSize);
        #else
            vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
            vec4 result = texture2D(uSource, coord);
        #endif
            float decay = 1.0 + dissipation * dt;
            gl_FragColor = result / decay;
        }`, ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']
    );

    const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uVelocity;
        void main () {
            float L = texture2D(uVelocity, vL).x;
            float R = texture2D(uVelocity, vR).x;
            float T = texture2D(uVelocity, vT).y;
            float B = texture2D(uVelocity, vB).y;
            vec2 C = texture2D(uVelocity, vUv).xy;
            if (vL.x < 0.0) { L = -C.x; }
            if (vR.x > 1.0) { R = -C.x; }
            if (vT.y > 1.0) { T = -C.y; }
            if (vB.y < 0.0) { B = -C.y; }
            float div = 0.5 * (R - L + T - B);
            gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
        }
    `);

    const curlShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uVelocity;
        void main () {
            float L = texture2D(uVelocity, vL).y;
            float R = texture2D(uVelocity, vR).y;
            float T = texture2D(uVelocity, vT).x;
            float B = texture2D(uVelocity, vB).x;
            float vorticity = R - L - T + B;
            gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
        }
    `);

    const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        uniform sampler2D uCurl;
        uniform float curl;
        uniform float dt;
        void main () {
            float L = texture2D(uCurl, vL).x;
            float R = texture2D(uCurl, vR).x;
            float T = texture2D(uCurl, vT).x;
            float B = texture2D(uCurl, vB).x;
            float C = texture2D(uCurl, vUv).x;
            vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
            force /= length(force) + 0.0001;
            force *= curl * C;
            force.y *= -1.0;
            vec2 velocity = texture2D(uVelocity, vUv).xy;
            velocity += force * dt;
            velocity = min(max(velocity, -1000.0), 1000.0);
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
    `);

    const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uDivergence;
        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            float C = texture2D(uPressure, vUv).x;
            float divergence = texture2D(uDivergence, vUv).x;
            float pressure = (L + R + B + T - divergence) * 0.25;
            gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
        }
    `);

    const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uVelocity;
        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            vec2 velocity = texture2D(uVelocity, vUv).xy;
            velocity.xy -= vec2(R - L, T - B);
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
    `);

    const blit = (() => {
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        return (target?: any, clear = false) => {
            if (target == null) {
                gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            } else {
                gl.viewport(0, 0, target.width, target.height);
                gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            }
            if (clear) { gl.clearColor(0.0, 0.0, 0.0, 1.0); gl.clear(gl.COLOR_BUFFER_BIT); }
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }
    })();

    let dye: any, velocity: any, divergence: any, curl: any, pressure: any, bloom: any;
    let bloomFramebuffers: any[] = [];
    let sunrays: any, sunraysTemp: any;
    
    const blurProgram = new Program(blurVertexShader, blurShader);
    const copyProgram = new Program(baseVertexShader, copyShader);
    const clearProgram = new Program(baseVertexShader, clearShader);
    const colorProgram = new Program(baseVertexShader, colorShader);
    const checkerboardProgram = new Program(baseVertexShader, checkerboardShader);
    const bloomPrefilterProgram = new Program(baseVertexShader, bloomPrefilterShader);
    const bloomBlurProgram = new Program(baseVertexShader, bloomBlurShader);
    const bloomFinalProgram = new Program(baseVertexShader, bloomFinalShader);
    const sunraysMaskProgram = new Program(baseVertexShader, sunraysMaskShader);
    const sunraysProgram = new Program(baseVertexShader, sunraysShader);
    const splatProgram = new Program(baseVertexShader, splatShader);
    const advectionProgram = new Program(baseVertexShader, advectionShader);
    const divergenceProgram = new Program(baseVertexShader, divergenceShader);
    const curlProgram = new Program(baseVertexShader, curlShader);
    const vorticityProgram = new Program(baseVertexShader, vorticityShader);
    const pressureProgram = new Program(baseVertexShader, pressureShader);
    const gradienSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);
    const displayMaterial = new Material(baseVertexShader, displayShaderSource);

    function initFramebuffers() {
        let simRes = getResolution(config.SIM_RESOLUTION);
        let dyeRes = getResolution(config.DYE_RESOLUTION);
        const texType = ext.halfFloatTexType;
        const rgba = ext.formatRGBA;
        const rg = ext.formatRG;
        const r = ext.formatR;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
        gl.disable(gl.BLEND);

        if (dye == null) dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        else dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        if (velocity == null) velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
        else velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

        divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        initBloomFramebuffers();
        initSunraysFramebuffers();
    }

    function initBloomFramebuffers() {
        let res = getResolution(config.BLOOM_RESOLUTION);
        const texType = ext.halfFloatTexType;
        const rgba = ext.formatRGBA;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
        bloom = createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);
        bloomFramebuffers.length = 0;
        for (let i = 0; i < config.BLOOM_ITERATIONS; i++) {
            let width = res.width >> (i + 1);
            let height = res.height >> (i + 1);
            if (width < 2 || height < 2) break;
            let fbo = createFBO(width, height, rgba.internalFormat, rgba.format, texType, filtering);
            bloomFramebuffers.push(fbo);
        }
    }

    function initSunraysFramebuffers() {
        let res = getResolution(config.SUNRAYS_RESOLUTION);
        const texType = ext.halfFloatTexType;
        const r = ext.formatR;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
        sunrays = createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
        sunraysTemp = createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
    }

    function createFBO(w: number, h: number, internalFormat: any, format: any, type: any, param: any) {
        gl.activeTexture(gl.TEXTURE0);
        let texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
        let fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.viewport(0, 0, w, h);
        gl.clear(gl.COLOR_BUFFER_BIT);
        let texelSizeX = 1.0 / w, texelSizeY = 1.0 / h;
        return { texture, fbo, width: w, height: h, texelSizeX, texelSizeY, attach(id: number) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
    }

    function createDoubleFBO(w: number, h: number, internalFormat: any, format: any, type: any, param: any) {
        let fbo1 = createFBO(w, h, internalFormat, format, type, param);
        let fbo2 = createFBO(w, h, internalFormat, format, type, param);
        return {
            width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
            get read() { return fbo1; }, set read(value) { fbo1 = value; },
            get write() { return fbo2; }, set write(value) { fbo2 = value; },
            swap() { let temp = fbo1; fbo1 = fbo2; fbo2 = temp; }
        }
    }

    function resizeFBO(target: any, w: number, h: number, internalFormat: any, format: any, type: any, param: any) {
        let newFBO = createFBO(w, h, internalFormat, format, type, param);
        copyProgram.bind();
        gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
        blit(newFBO);
        return newFBO;
    }

    function resizeDoubleFBO(target: any, w: number, h: number, internalFormat: any, format: any, type: any, param: any) {
        if (target.width == w && target.height == h) return target;
        target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
        target.write = createFBO(w, h, internalFormat, format, type, param);
        target.width = w; target.height = h;
        target.texelSizeX = 1.0 / w; target.texelSizeY = 1.0 / h;
        return target;
    }

    function updateKeywords() {
        let displayKeywords = [];
        if (config.SHADING) displayKeywords.push("SHADING");
        if (config.BLOOM) displayKeywords.push("BLOOM");
        if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
        if (config.CAUSTICS) displayKeywords.push("CAUSTICS");
        displayMaterial.setKeywords(displayKeywords);
    }
    
    // Core sim loops
    let lastUpdateTime = Date.now();
    let colorUpdateTimer = 0.0;
    
    let audioContext: any, analyser: any, microphone: any, dataArray: any;
    let currentThreshold = 100, maxThreshold = -Infinity, cycleCount = 0, activeSplats = 0;

    async function initAudio() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            return true;
        } catch (e) { return false; }
    }

    function getDecibelLevel() {
        if (!analyser || !dataArray) return -Infinity;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        return 20 * Math.log10((sum / dataArray.length) / 255);
    }

    function createSplat() {
        if (activeSplats < config.MAX_ACTIVE_SPLATS) {
            splatStack.push(parseInt((Math.random() * 20).toString()) + 5);
            activeSplats++;
            setTimeout(() => activeSplats--, 500);
        }
    }
    
    let audioMonitorTimeout: any = null;
    function monitorAudio() {
        const decibelLevel = getDecibelLevel();
        if (decibelLevel !== -Infinity) {
            maxThreshold = Math.max(maxThreshold, decibelLevel);
            if (decibelLevel > currentThreshold) createSplat();
        }
        cycleCount++;
        if (cycleCount >= config.CYCLES_TO_UPDATE) {
            currentThreshold = maxThreshold - 1;
            maxThreshold = -Infinity;
            cycleCount = 0;
        }
        audioMonitorTimeout = setTimeout(monitorAudio, config.CYCLE_INTERVAL);
    }

    async function startSimulation() {
        if (config.AUDIO_ENABLED) {
            const audioInitialized = await initAudio();
            createSplat();
            if (audioInitialized) monitorAudio();
        } else {
            createSplat();
        }
    }

    function calcDeltaTime() {
        let now = Date.now();
        let dt = (now - lastUpdateTime) / 1000;
        dt = Math.min(dt, 0.016666);
        lastUpdateTime = now;
        return dt;
    }

    function resizeCanvas() {
        let width = scaleByPixelRatio(window.innerWidth);
        let height = scaleByPixelRatio(window.innerHeight);
        if (canvas.width != width || canvas.height != height) {
            canvas.width = width;
            canvas.height = height;
            return true;
        }
        return false;
    }

    function updateColors(dt: number) {
        if (!config.COLORFUL) return;
        colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
        if (colorUpdateTimer >= 1) {
            colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
            pointers.forEach(p => p.color = generateColor());
        }
    }

    function applyInputs() {
        if (splatStack.length > 0) multipleSplats(splatStack.pop()!);
        for (let i = pointers.length - 1; i >= 0; i--) {
            let p = pointers[i];
            if (p.moved) { p.moved = false; splatPointer(p); }
            if (p.id === -2 && !p.down) pointers.splice(i, 1);
        }
    }

    function step(dt: number) {
        gl.disable(gl.BLEND);
        curlProgram.bind();
        gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
        blit(curl);

        vorticityProgram.bind();
        gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
        gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
        gl.uniform1f(vorticityProgram.uniforms.dt, dt);
        blit(velocity.write);
        velocity.swap();

        divergenceProgram.bind();
        gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
        blit(divergence);

        clearProgram.bind();
        gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
        gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
        blit(pressure.write);
        pressure.swap();

        pressureProgram.bind();
        gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
        for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
            blit(pressure.write);
            pressure.swap();
        }

        gradienSubtractProgram.bind();
        gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
        gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
        blit(velocity.write);
        velocity.swap();

        advectionProgram.bind();
        gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
        let velocityId = velocity.read.attach(0);
        gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
        gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
        gl.uniform1f(advectionProgram.uniforms.dt, dt);
        gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
        blit(velocity.write);
        velocity.swap();

        if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
        gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
        gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
        blit(dye.write);
        dye.swap();
    }

    function render(target: any) {
        if (config.BLOOM) applyBloom(dye.read, bloom);
        if (config.SUNRAYS) { applySunrays(dye.read, dye.write, sunrays); blur(sunrays, sunraysTemp, 1); }
        if (target == null || !config.TRANSPARENT) { gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.BLEND); }
        else { gl.disable(gl.BLEND); }
        if (!config.TRANSPARENT) drawColor(target, normalizeColor(config.BACK_COLOR));
        if (target == null && config.TRANSPARENT) drawCheckerboard(target);
        drawDisplay(target);
    }

    function drawColor(target: any, color: any) {
        colorProgram.bind();
        gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
        blit(target);
    }
    function drawCheckerboard(target: any) {
        checkerboardProgram.bind();
        gl.uniform1f(checkerboardProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        blit(target);
    }
    function drawDisplay(target: any) {
        let width = target == null ? gl.drawingBufferWidth : target.width;
        let height = target == null ? gl.drawingBufferHeight : target.height;
        displayMaterial.bind();
        if (config.SHADING) gl.uniform2f(displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
        gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
        if (config.BLOOM) {
            gl.uniform1i(displayMaterial.uniforms.uBloom, bloom.attach(1));
        }
        if (config.SUNRAYS) gl.uniform1i(displayMaterial.uniforms.uSunrays, sunrays.attach(3));
        if (config.CAUSTICS && displayMaterial.uniforms.reflectIntensity) {
            gl.uniform1f(displayMaterial.uniforms.reflectIntensity, config.REFLECT_INTENSITY);
            gl.uniform1f(displayMaterial.uniforms.lightAngle, config.LIGHT_ANGLE);
        }
        blit(target);
    }

    function applyBloom(source: any, destination: any) {
        if (bloomFramebuffers.length < 2) return;
        let last = destination;
        gl.disable(gl.BLEND);
        bloomPrefilterProgram.bind();
        let knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
        let curve0 = config.BLOOM_THRESHOLD - knee;
        let curve1 = knee * 2;
        let curve2 = 0.25 / knee;
        gl.uniform3f(bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
        gl.uniform1f(bloomPrefilterProgram.uniforms.threshold, config.BLOOM_THRESHOLD);
        gl.uniform1i(bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
        blit(last);
        bloomBlurProgram.bind();
        for (let i = 0; i < bloomFramebuffers.length; i++) {
            let dest = bloomFramebuffers[i];
            gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
            gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
            blit(dest);
            last = dest;
        }
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.enable(gl.BLEND);
        for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
            let baseTex = bloomFramebuffers[i];
            gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
            gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
            gl.viewport(0, 0, baseTex.width, baseTex.height);
            blit(baseTex);
            last = baseTex;
        }
        gl.disable(gl.BLEND);
        bloomFinalProgram.bind();
        gl.uniform2f(bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0));
        gl.uniform1f(bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY);
        blit(destination);
    }
    function applySunrays(source: any, mask: any, destination: any) {
        gl.disable(gl.BLEND);
        sunraysMaskProgram.bind();
        gl.uniform1i(sunraysMaskProgram.uniforms.uTexture, source.attach(0));
        blit(mask);
        sunraysProgram.bind();
        gl.uniform1f(sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
        gl.uniform1i(sunraysProgram.uniforms.uTexture, mask.attach(0));
        blit(destination);
    }
    function blur(target: any, temp: any, iterations: number) {
        blurProgram.bind();
        for (let i = 0; i < iterations; i++) {
            gl.uniform2f(blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
            gl.uniform1i(blurProgram.uniforms.uTexture, target.attach(0));
            blit(temp);
            gl.uniform2f(blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
            gl.uniform1i(blurProgram.uniforms.uTexture, temp.attach(0));
            blit(target);
        }
    }
    function splatPointer(pointer: any) {
        let dx = pointer.deltaX * config.SPLAT_FORCE;
        let dy = pointer.deltaY * config.SPLAT_FORCE;
        splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
    }
    function multipleSplats(amount: number) {
        for (let i = 0; i < amount; i++) {
            const color = generateColor();
            color.r *= 10.0; color.g *= 10.0; color.b *= 10.0;
            const x = Math.random(); const y = Math.random();
            const dx = 1000 * (Math.random() - 0.5); const dy = 1000 * (Math.random() - 0.5);
            splat(x, y, dx, dy, color);
        }
    }
    function splat(x: number, y: number, dx: number, dy: number, color: any) {
        splatProgram.bind();
        gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
        gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(splatProgram.uniforms.point, x, y);
        gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
        gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
        blit(velocity.write);
        velocity.swap();

        gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
        gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
        blit(dye.write);
        dye.swap();
    }
    function correctRadius(radius: number) {
        let aspectRatio = canvas.width / canvas.height;
        if (aspectRatio > 1) radius *= aspectRatio;
        return radius;
    }
    function updatePointerDownData(pointer: any, id: number, posX: number, posY: number) {
        pointer.id = id;
        pointer.down = true;
        pointer.moved = false;
        pointer.texcoordX = posX / canvas.width;
        pointer.texcoordY = 1.0 - posY / canvas.height;
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.deltaX = 0;
        pointer.deltaY = 0;
        pointer.color = generateColor();
    }
    function updatePointerMoveData(pointer: any, posX: number, posY: number) {
        pointer.prevTexcoordX = pointer.texcoordX;
        pointer.prevTexcoordY = pointer.texcoordY;
        pointer.texcoordX = posX / canvas.width;
        pointer.texcoordY = 1.0 - posY / canvas.height;
        pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
        pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
        pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
    }
    function updatePointerUpData(pointer: any) {
        pointer.down = false;
    }
    function correctDeltaX(delta: number) {
        let aspectRatio = canvas.width / canvas.height;
        if (aspectRatio < 1) delta *= aspectRatio;
        return delta;
    }
    function correctDeltaY(delta: number) {
        let aspectRatio = canvas.width / canvas.height;
        if (aspectRatio > 1) delta /= aspectRatio;
        return delta;
    }
    function generateColor() {
        let hue = 0, sat = 1, rMult = 1, gMult = 1, bMult = 1;

        switch (config.COLOR_PALETTE) {
            case 'Rose Gold':
                hue = 0.0 + Math.random() * 0.05;
                sat = Math.random() > 0.9 ? 0.3 : 0.6;
                rMult = 0.3; gMult = 0.16; bMult = 0.14;
                break;
            case 'White Gold':
                hue = 0.10 + Math.random() * 0.05;
                sat = Math.random() > 0.9 ? 0.05 : 0.15;
                rMult = 0.25; gMult = 0.25; bMult = 0.26;
                break;
            case 'Cosmic':
                hue = 0.7 + Math.random() * 0.2; // deep purples to pinks
                sat = Math.random() > 0.8 ? 0.8 : 1.0;
                rMult = 0.4; gMult = 0.1; bMult = 0.5;
                break;
            case 'Neon':
                hue = 0.4 + Math.random() * 0.5; // cyan to magenta
                sat = 1.0;
                rMult = 0.5; gMult = 1.0; bMult = 1.0;
                break;
            case 'Ocean':
                hue = 0.5 + Math.random() * 0.15; // blues and teals
                sat = 0.8 + Math.random() * 0.2;
                rMult = 0.1; gMult = 0.4; bMult = 0.5;
                break;
            case 'Volcanic':
                hue = 0.0 + Math.random() * 0.1; // reds and oranges
                sat = 0.9 + Math.random() * 0.1;
                rMult = 0.6; gMult = 0.2; bMult = 0.05;
                break;
            case 'Cyberpunk':
                hue = Math.random() > 0.5 ? 0.8 : 0.5; // stark magenta or cyan
                sat = 1.0;
                rMult = 0.5; gMult = 0.5; bMult = 0.5;
                break;
            case 'Rainbow':
                hue = Math.random();
                sat = 1.0;
                rMult = Math.random() * 0.3 + 0.2; 
                gMult = Math.random() * 0.3 + 0.2; 
                bMult = Math.random() * 0.3 + 0.2;
                break;
            case 'Liquid Gold':
            default:
                hue = 0.09 + Math.random() * 0.06;
                sat = Math.random() > 0.9 ? 0.4 : 1.0;
                rMult = 0.3; gMult = 0.25; bMult = 0.1;
                break;
        }

        let c = HSVtoRGB(hue, sat, 1.0);
        c.r *= rMult; c.g *= gMult; c.b *= bMult;
        return c;
    }
    function HSVtoRGB(h: number, s: number, v: number) {
        let r=0, g=0, b=0, i, f, p, q, t;
        i = Math.floor(h * 6);
        f = h * 6 - i;
        p = v * (1 - s);
        q = v * (1 - f * s);
        t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return { r, g, b };
    }
    function normalizeColor(input: any) {
        return { r: input.r / 255, g: input.g / 255, b: input.b / 255 };
    }
    function wrap(value: number, min: number, max: number) {
        let range = max - min;
        if (range == 0) return min;
        return (value - min) % range + min;
    }
    function getResolution(resolution: number) {
        let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
        let min = Math.round(resolution);
        let max = Math.round(resolution * aspectRatio);
        if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
        else return { width: min, height: max };
    }
    function scaleByPixelRatio(input: number) {
        let pixelRatio = window.devicePixelRatio || 1;
        if (isMobile()) {
            pixelRatio = 1; // drastically improves fps on high-dpi mobile screens
        }
        return Math.floor(input * pixelRatio);
    }
    function hashCode(s: string) {
        if (s.length == 0) return 0;
        let hash = 0;
        for (let i = 0; i < s.length; i++) {
            hash = (hash << 5) - hash + s.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    const onMouseDown = (e: MouseEvent) => {
        let posX = scaleByPixelRatio(e.offsetX);
        let posY = scaleByPixelRatio(e.offsetY);
        let pointer = pointers.find(p => p.id == -1);
        if (pointer == null) pointer = new pointerPrototype();
        updatePointerDownData(pointer, -1, posX, posY);
    };
    canvas.addEventListener('mousedown', onMouseDown);
    
    const onMouseMove = (e: MouseEvent) => {
        let pointer = pointers[0];
        if (!pointer.down) return;
        let posX = scaleByPixelRatio(e.offsetX);
        let posY = scaleByPixelRatio(e.offsetY);
        updatePointerMoveData(pointer, posX, posY);
    };
    canvas.addEventListener('mousemove', onMouseMove);
    
    const onMouseUp = () => { updatePointerUpData(pointers[0]); };
    window.addEventListener('mouseup', onMouseUp);
    
    const onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        const touches = e.targetTouches;
        while (touches.length >= pointers.length) pointers.push(new pointerPrototype());
        for (let i = 0; i < touches.length; i++) {
            let posX = scaleByPixelRatio(touches[i].pageX);
            let posY = scaleByPixelRatio(touches[i].pageY);
            updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
        }
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    
    const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        const touches = e.targetTouches;
        for (let i = 0; i < touches.length; i++) {
            let pointer = pointers[i + 1];
            if (!pointer.down) continue;
            let posX = scaleByPixelRatio(touches[i].pageX);
            let posY = scaleByPixelRatio(touches[i].pageY);
            updatePointerMoveData(pointer, posX, posY);
        }
    };
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    
    const onTouchEnd = (e: TouchEvent) => {
        const touches = e.changedTouches;
        for (let i = 0; i < touches.length; i++) {
            let pointer = pointers.find(p => p.id == touches[i].identifier);
            if (pointer == null) continue;
            updatePointerUpData(pointer);
        }
    };
    window.addEventListener('touchend', onTouchEnd);

    const onResize = () => {
        resizeCanvas();
        initFramebuffers();
    };
    window.addEventListener('resize', onResize);

    updateKeywords();
    initFramebuffers();
    multipleSplats(parseInt((Math.random() * 20).toString()) + 5);

    let animationFrameId: number;
    function update() {
        const dt = calcDeltaTime();
        if (resizeCanvas()) initFramebuffers();
        updateColors(dt);
        applyInputs();
        if (!config.PAUSED) step(dt);
        render(null);
        animationFrameId = requestAnimationFrame(update);
    }
    
    startGUI();
    if (config.DEMO_MODE) startDemoMode();
    startSimulation();
    animationFrameId = requestAnimationFrame(update);

    if (onReady) {
        onReady({
            updateConfig: (newConfig: Partial<typeof config>) => {
                Object.assign(config, newConfig);
                updateKeywords();
                initFramebuffers();
            },
            getConfig: () => ({ ...config }),
            triggerSplat: (x: number, y: number, dx: number, dy: number, color: {r: number, g: number, b: number}) => {
                splat(x, y, dx, dy, color);
            },
            multipleSplats: (amount: number) => {
                multipleSplats(amount);
            }
        });
    }

    return () => {
        if (gui && typeof gui.destroy === 'function') gui.destroy();
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (audioContext) { audioContext.close(); audioContext = null; }
        if (demoInterval) clearTimeout(demoInterval);
        if (audioMonitorTimeout) clearTimeout(audioMonitorTimeout);
        activeMoveIntervals.forEach(interval => clearInterval(interval));
        
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('resize', onResize);
    };
}
