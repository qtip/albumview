"use strict";

var squareVerts = new Float32Array([
    1.0, -1.0, 0.0, 1.0, //pos
    1.0, 1.0, //uv
    -1.0, -1.0, 0.0, 1.0, //pos
    0.0, 1.0, //uv
    1.0, 1.0, 0.0, 1.0, //pos
    1.0, 0.0, //uv
    -1.0, 1.0, 0.0, 1.0, //pos
    0.0, 0.0 //uv
]);

var requestAnimFrame = (function(){
    return  window.requestAnimationFrame       || 
            window.webkitRequestAnimationFrame || 
            window.mozRequestAnimationFrame    || 
            window.oRequestAnimationFrame      || 
            window.msRequestAnimationFrame;
})();

var cancelAnimFrame = (function(){
    return  window.cancelAnimationFrame       || 
            window.webkitCancelAnimationFrame || 
            window.mozCancelAnimationFrame    || 
            window.oCancelAnimationFrame      || 
            window.msCancelAnimationFrame;
})();

function AlbumView(canvasEl) {
    var thiss = this;
    this.scrollSpeed = .01;
    this.items = [];
    this.isMouseOver = false;
    this.mousePos = {x:0, y:0};
    this.mousePosDelta = {x:0, y:0};
    this.isMouseDown = false;
    this.mouseDownPos = {x:0, y:0};
    this.offset = 0.0;
    this.currentAnimationFrameRequest = null;
    canvasEl.onmousemove = function(e){
        thiss.mousePosDelta.x = e.offsetX - thiss.mousePos.x;
        thiss.mousePosDelta.y = e.offsetY - thiss.mousePos.y;
        thiss.mousePos.x = e.offsetX || e.layerX;
        thiss.mousePos.y = e.offsetY || e.layerY;
    };
    canvasEl.onmouseover = function(e){
        thiss.isMouseOver = true;
    };
    canvasEl.onmouseout = function(e){
        thiss.isMouseOver = false;
        if (thiss.isMouseDown){
            thiss.isMouseDown = false;
            thiss.finishDragging();
        }
    };
    canvasEl.onmousedown = function(e){
        thiss.beginAnimLoop();
        thiss.isMouseDown = true;
        thiss.mouseDownPos.x = e.offsetX || e.layerX;
        thiss.mouseDownPos.y = e.offsetY || e.layerY;
        thiss.mousePos.x = e.offsetX || e.layerX;
        thiss.mousePos.y = e.offsetY || e.layerY;
        thiss.mousePosDelta = {x:0, y:0};

    };
    canvasEl.onmouseup = function(e){
        if (thiss.isMouseDown){
            thiss.isMouseDown = false;
            thiss.finishDragging();
        }
    };
    this.matPerspective = mat4.create();
    mat4.perspective(35, canvasEl.width/(canvasEl.height != 0 ? canvasEl.height : 1.0), 1, 100, this.matPerspective);
    this.matOrtho = mat4.create();
    mat4.ortho(0,canvasEl.width, canvasEl.height, 0, -1, 1, this.matOrtho);
    this.gl = canvasEl.getContext("webgl") || canvasEl.getContext("experimental-webgl");
    this.squareBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, squareVerts, this.gl.STATIC_DRAW);
    this.noteTexture = this.gl.createTexture();
    this.noteImage = new Image();
    this.noteImage.src = "note.png";
    this.noteImage.onload = function(){
        thiss.beginAnimLoop();
        thiss.gl.bindTexture(thiss.gl.TEXTURE_2D, thiss.noteTexture);
        thiss.gl.pixelStorei(thiss.gl.UNPACK_FLIP_Y_WEBGL, false);
        // Upload the texture data to the hardware.
        thiss.gl.texImage2D(thiss.gl.TEXTURE_2D, 0, thiss.gl.RGBA, thiss.gl.RGBA, thiss.gl.UNSIGNED_BYTE, thiss.noteImage);
        thiss.gl.texParameteri(thiss.gl.TEXTURE_2D, thiss.gl.TEXTURE_MAG_FILTER, thiss.gl.NEAREST);
        thiss.gl.texParameteri(thiss.gl.TEXTURE_2D, thiss.gl.TEXTURE_MIN_FILTER, thiss.gl.NEAREST);
    }

    var vertexShaderSrc = "" +
    "attribute vec4 aVertexPosition; \n" +
    "attribute vec2 aVertexUV; \n" +
    "uniform mat4 uModelView; \n" +
    "uniform mat4 uPerspective; \n" +
    "uniform bool uMirrorMode; \n" +
    "varying vec2 vVertexUV; \n" +
    "void main(void) { \n" +
    "    vVertexUV = aVertexUV; \n" +
    "    vec4 pos = aVertexPosition; \n" +
    "    if ( uMirrorMode) { \n" +
    "       pos.y = -pos.y-2.0; \n" +
    "    } \n" +
    "    gl_Position = uPerspective * uModelView * pos; \n" +
    "} ";

    var fragShaderSrc = "" +
    "precision mediump float; \n" +
    "uniform bool uMirrorMode; \n" +
    "uniform sampler2D uTextureSampler; " +
    "varying vec2 vVertexUV; \n" +
    "void main(void) { \n" +
    "    float intensity = (1.1-distance(vVertexUV, vec2(0.5, -0.1)))*0.3; \n" + 
    "    vec4 texSampleColor = texture2D(uTextureSampler, vVertexUV)*(intensity+.5); \n" +
    "    vec4 lightColor = vec4(intensity, intensity, intensity, 1.0); \n" +
    "    gl_FragColor = vec4(mix(texSampleColor.rgb, lightColor.rgb, 1.0-texSampleColor.a), 1.0); \n" +
    "    if ( uMirrorMode) { \n" +
    "       gl_FragColor.rgb *= 0.3; \n" +
    "    } \n" +
    "} ";

    this.vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(this.vertexShader, vertexShaderSrc);
    this.gl.compileShader(this.vertexShader);
    if (!this.gl.getShaderParameter(this.vertexShader, this.gl.COMPILE_STATUS)) {
        alert(this.gl.getShaderInfoLog(this.vertexShader));
        return null;
    }

    this.fragShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
    this.gl.shaderSource(this.fragShader, fragShaderSrc);
    this.gl.compileShader(this.fragShader);
    if (!this.gl.getShaderParameter(this.fragShader, this.gl.COMPILE_STATUS)) {
        alert(this.gl.getShaderInfoLog(this.fragShader));
        return null;
    }

    this.shaderProgram = this.gl.createProgram();
    this.gl.attachShader(this.shaderProgram, this.vertexShader);
    this.gl.attachShader(this.shaderProgram, this.fragShader);
    this.gl.linkProgram(this.shaderProgram);
    if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
    }

    this.gl.useProgram(this.shaderProgram);
    this.gl.enableVertexAttribArray(this.gl.getAttribLocation(this.shaderProgram, "aVertexPosition"));
    this.gl.enableVertexAttribArray(this.gl.getAttribLocation(this.shaderProgram, "aVertexUV"));

    this.gl.viewport(0, 0, canvasEl.width, canvasEl.height);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.clearColor(0.0,0.0,0.0,1.0);
    this.t = 0;
    this.beginAnimLoop(this);
}
AlbumView.prototype.finishDragging = function(){
    this.offset -= (this.mousePos.x - this.mouseDownPos.x)*this.scrollSpeed;
}

// Begins the animation loop. Will kill the old running loop to prevent multiple anim
// loops.
AlbumView.prototype.beginAnimLoop = function(){
    if (this.currentAnimationFrameRequest != null){
        cancelAnimFrame(this.currentAnimationFrameRequest);
    }
    var thiss = this;
    this.currentAnimationFrameRequest = requestAnimFrame(function(){thiss.animloop(thiss);});
}

// Called each frame of the animation. May halt the animation loop
AlbumView.prototype.animloop = function(thiss){
    thiss.t += 1;
    thiss.currentAnimationFrameRequest = requestAnimFrame(function(){thiss.animloop(thiss);});
    var relOffset = Math.abs(thiss.offset % 1.0);
    if (thiss.offset < 0){
        relOffset = 1.0 - relOffset;
    }
    if (thiss.isMouseDown){
        thiss.draw(thiss.offset - (thiss.mousePos.x - thiss.mouseDownPos.x)*thiss.scrollSpeed);
    } else {
        if (0.1 < relOffset && relOffset <= 0.5){
            thiss.offset -= .05;
        } else if (0.5 < relOffset && relOffset <= 0.9){
            thiss.offset += .05;
        } else {
            thiss.offset = Math.round(thiss.offset);
            cancelAnimFrame(thiss.currentAnimationFrameRequest);
            if (thiss.items[thiss.offset] !== undefined && thiss.onSelected !== null){
                thiss.onSelected(thiss.items[thiss.offset], thiss);
            }
        }
        thiss.draw(thiss.offset);
    }
};

AlbumView.prototype.push = function(item){
    var thiss = this;
    if ("img" in item){
        item.__image = new Image();
        item.__image.src = item.img;
        item.__texture = this.gl.createTexture();
        item.__isTextureLoaded = false;
        item.__image.onload = function(){
            item.__isTextureLoaded = true;
            thiss.beginAnimLoop();
            thiss.gl.bindTexture(thiss.gl.TEXTURE_2D, item.__texture);
            thiss.gl.pixelStorei(thiss.gl.UNPACK_FLIP_Y_WEBGL, false);
            // Upload the texture data to the hardware.
            thiss.gl.texImage2D(thiss.gl.TEXTURE_2D, 0, thiss.gl.RGBA, thiss.gl.RGBA, thiss.gl.UNSIGNED_BYTE, item.__image);
            thiss.gl.texParameteri(thiss.gl.TEXTURE_2D, thiss.gl.TEXTURE_MAG_FILTER, thiss.gl.NEAREST);
            thiss.gl.texParameteri(thiss.gl.TEXTURE_2D, thiss.gl.TEXTURE_MIN_FILTER, thiss.gl.NEAREST);
        }
    }
    this.items.push(item);
};

function makeMatModelView(offset){
    //-45(x*10)/(1+abs(x*10))
    var angle = -(Math.PI*0.5*offset)/(1+Math.abs(offset));//  * (1.0-Math.pow(2, -Math.pow(offset*3,4)));;
    var x = ((3*offset*5)/(1+Math.abs(offset*5))+offset) * 0.5  * (1.0-Math.pow(2, -Math.pow(offset*5,4)));
    var z = Math.pow(2, (-Math.pow(offset*2, 4)));
    var matModelView = mat4.create();
    mat4.identity(matModelView);
    mat4.translate(matModelView, [x, 0.4, z-5.5]);
    mat4.rotate(matModelView,angle, [0, 1, 0]);
    return matModelView;
}

AlbumView.prototype.draw = function(offset){
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareBuffer);
    this.gl.vertexAttribPointer(this.gl.getAttribLocation(this.shaderProgram, "aVertexPosition"), 4, this.gl.FLOAT, false, 6*(32/8), 0);
    this.gl.vertexAttribPointer(this.gl.getAttribLocation(this.shaderProgram, "aVertexUV"), 2, this.gl.FLOAT, false, 6*(32/8), 4*(32/8));
    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.shaderProgram, "uPerspective"), false, this.matPerspective);
    //reflection
    this.gl.uniform1i(this.gl.getUniformLocation(this.shaderProgram, "uMirrorMode"), 1);
    var i;
    for (i = 0; i < this.items.length; i++){
        this.gl.activeTexture(this.gl.TEXTURE0);
        if (this.items[i] !== undefined && this.items[i].__image !== undefined && this.items[i].__isTextureLoaded){
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.items[i].__texture);
        } else {
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.noteTexture);
        }
        this.gl.uniform1i(this.gl.getUniformLocation(this.shaderProgram, "uTextureSampler"), 0);

        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.shaderProgram, "uModelView"), false, makeMatModelView(i-offset));
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
    //album covers
    this.gl.uniform1i(this.gl.getUniformLocation(this.shaderProgram, "uMirrorMode"), 0);
    for (i = 0; i < this.items.length; i++){
        this.gl.activeTexture(this.gl.TEXTURE0);
        if (this.items[i] !== undefined && this.items[i].__image !== undefined && this.items[i].__isTextureLoaded){
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.items[i].__texture);
        } else {
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.noteTexture);
        }
        this.gl.uniform1i(this.gl.getUniformLocation(this.shaderProgram, "uTextureSampler"), 0);

        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.shaderProgram, "uModelView"), false, makeMatModelView(i-offset));
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}
