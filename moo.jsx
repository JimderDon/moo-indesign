//---------------------------------------------------------*- javascript -*----
//
// moo.jsx
//
// an InDesign script to assist in the creation of MOO Business Cards
//
// (c) MOO Print Ltd 2012
//
//-----------------------------------------------------------------------------
//
// includes the following third-party libraries (see below for licences):
//
// OAuth  (c) Netflix, Inc. 2008 
// SHA    (c) Brian Turek 2008-2010
// JSON       Douglas Crockford (Public Domain)
//
//-----------------------------------------------------------------------------

#targetengine 'session'

(function() {
    var API_HOST = 'uk.moo.com';

    var API_KEY = 'a688570817ce61d49cebd98b933acec604f8834a1';
    var API_SECRET = '24bd1fc5e812b8412a6ffd787867fd3e';

    var USER_AGENT = 'MOO InDesign ExtendScript';

    var SIDE_TYPES = {details: {name: 'Details', prefix: 'D'},
                      image: {name: 'Image', prefix: 'I'}};

    var ORIENTATIONS = {landscape: {name: 'Landscape', code: PageOrientation.landscape},
                        portrait: {name: 'Portrait', code: PageOrientation.portrait}};
    
    var SIZES = [{name: "Business Card",
                  mooName: "businesscard",
                  templates: {details: {landscape: {code: "businesscard_full_details_image_landscape",
                                                    linkId: 'variable_image_back'},
                                        portrait: {code: "businesscard_full_details_image_portrait",
                                                   linkId: 'variable_image_back'}},
                              image:  {landscape: {code: "businesscard_full_image_landscape",
                                                   linkId: 'variable_image_front'},
                                       portrait: {code: "businesscard_full_image_portrait",
                                                  linkId: 'variable_image_front'}}},
                  width: 84, //mm
                  height: 55, //mm
                  items: 50 
                 },
                 {name: "MiniCard",
                  mooName: "minicard",
                  templates: {details: {landscape: {code: "minicard_full_details_image_landscape",
                                                    linkId: 'variable_image_back'},
                                        portrait: {code: "minicard_full_details_image_portrait",
                                                   linkId: 'variable_image_back'}},
                              image:  {landscape: {code: "minicard_full_image_landscape",
                                                   linkId: 'variable_image_front'},
                                       portrait: {code: "minicard_full_image_portrait",
                                                  linkId: 'variable_image_front'}}},
                  width: 70, //mm
                  height: 28, //mm
                  items: 100
                 },
                 {name: "Postcard",
                  mooName: "postcard",
                  templates: {details: {landscape: {code: "postcard_full_details_image_landscape",
                                                    linkId: 'variable_image_back'},
                                        portrait: {code: "postcard_full_details_image_portrait",
                                                   linkId: 'variable_image_back'}},
                              image:  {landscape: {code: "postcard_full_image_landscape",
                                                   linkId: 'variable_image_front'},
                                       portrait: {code: "postcard_full_image_portrait",
                                                  linkId: 'variable_image_front'}}},
                  width: 148, //mm
                  height: 105, //mm
                  items: 20
                 }];

    var BLEED = 2; //mm
    var MARGIN = 2; //mm
    var SLUG = 8; //mm

    var PDF_EXPORT_PRESET = {
        name: "MOO",
        bleedTop: BLEED + "mm",
        bleedBottom: BLEED + "mm",
        bleedInside: BLEED + "mm",
        bleedOutside: BLEED + "mm",
        bleedMarks: false,
        colorBitmapCompression: BitmapCompression.NONE,
        cropMarks: false,
        exportGuidesAndGrids: false,
        exportLayers: false,
        exportNonprintingObjects: false,
        generateThumbnails: false,
        grayscaleBitmapCompression: BitmapCompression.NONE,
        includeSlugWithPDF: false,
        monochromeBitmapCompression: BitmapCompression.NONE,
        optimizePDF: false,
        pageInformationMarks: false,
        standardsCompliance: PDFXStandards.PDFX1A2003_STANDARD,
        useDocumentBleedWithPDF: true
    };

    function documentPresetForSizeAndOrientation(size, orientation) {
        return {
            name: orientation.name + ' ' + size.name,
            pageHeight: size.height + "mm",
            pageWidth: size.width + "mm",
            pageOrientation: orientation.code,
            intent: DocumentIntentOptions.PRINT_INTENT,
            facingPages: false,
            documentBleedUniformSize: true,
            documentBleedTopOffset: BLEED + "mm",
            top: MARGIN + "mm",
            bottom: MARGIN + "mm",
            left: MARGIN + "mm",
            right: MARGIN + "mm",
            slugTopOffset: SLUG + "mm"
        };
    }

    function masterForSideType(document, sideType) {
        // validate sideType?
        var sideTypeObj = SIDE_TYPES[sideType];
        var masters = document.masterSpreads;
        for (var i = 0; i < masters.count(); ++ i) {
            var master = masters.item(i);
            if (master.baseName === sideTypeObj.name) {
                return master;
            }
        }

        // need to create master, then

        var master = document.masterSpreads.add(1, {baseName: sideTypeObj.name, namePrefix: sideTypeObj.prefix});

	    var page = master.pages.item(0);
        var measurements = pageMeasurements(page);
	    var textFrame = master.pages.item(0).textFrames.add();
        textFrame.geometricBounds = [-document.documentPreferences.slugTopOffset, 0,
				                     -document.documentPreferences.documentBleedTopOffset, measurements.width];
        textFrame.contents = SIDE_TYPES[sideType].name + " side";
        text = textFrame.texts.item(0);
        text.pointSize = 10;
        text.justification = Justification.centerAlign;
	    
	    // place something on it

	    return master;
    }

    function setSideTypeForPage(document, page, sideType) {
        page.appliedMaster = masterForSideType(document, sideType);
    }

    function sideTypeForPage(page) {
        var master = page.appliedMaster;

        if (master && master !== NothingEnum.NOTHING) {
            for (var sideType in SIDE_TYPES) {
                var name = SIDE_TYPES[sideType].name;
                if (master.baseName === name) {
                    return sideType;
                }
            }
        }

        return undefined;
    }

    function simplePack(document, imageBasketItems, size) {
        var sides = [];

        var itemCount = imageBasketItems.length;
        var sideTypesSeen = {};

        for (var i = 0; i < itemCount; ++ i) {
            var page = document.pages.item(i);
            var sideType = sideTypeForPage(page); // should be valid by this point
            var orientation = 'landscape';
            var data = [];

            var measurements = pageMeasurements(page);
            orientation = measurements.width > measurements.height ? 'landscape' : 'portrait';
            
            var w = orientation === 'landscape' ? size.width : size.height;
            var h = orientation === 'landscape' ? size.height : size.width;
            
            data = [{
                type: 'imageData',
                linkId: size.templates[sideType][orientation].linkId,
                imageBox: {
                    center: {
                        x: w / 2 + BLEED,
                        y: h / 2 + BLEED
                    },
                    width: w + BLEED * 2,
                    height: h + BLEED * 2,
                    angle: 0
                },
                resourceUri: imageBasketItems[i].resourceUri,
                enhance: false
            }];

            sides.push({
                type: sideType,
                sideNum: i + 1,
                templateCode: size.templates[sideType][orientation].code,
                data: data
            });

            sideTypesSeen[sideType] = true;
        }

        // need at least one of each side
        
        for (var sideType in SIDE_TYPES) {
            if (!(sideType in sideTypesSeen)) {
                sides.push({
                    type: sideType,
                    sideNum: 0,
                    templateCode: size.templates[sideType]['landscape'].code,
                    data: []
                });
            }            
        }
        
        return {
            numCards: size.items,
            productCode: size.mooName,
            productVersion: 1,
            sides: sides,
            extras: [],
            imageBasket: {
                items: imageBasketItems
            }
        };
    }

    function pageMeasurements(page) {
        var bounds = page.bounds;
        var width = Math.round(bounds[3] - bounds[1]);
        var height = Math.round(bounds[2] - bounds[0]);

        return {width: width, height: height};
    }

    function pageMatchesSize(page, size) {
        var measurements = pageMeasurements(page);

        var matches = (measurements.width.toString() == size.width.toString() && measurements.height.toString() == size.height.toString())
            || (measurements.height.toString() == size.width.toString() && measurements.width.toString() == size.height.toString());

        return matches;
    }

    function checkSideTypes(document) {
        var ok = true;
        var pageCount = document.pages.length;
        for (var i = 0; i < pageCount && ok; ++ i) {
            var page = document.pages.item(i);
            ok = sideTypeForPage(page) in SIDE_TYPES;
        }
        return ok;
    }

    function sizeForDocument(document) {
        // either returns size object or undefined

        var pageCount = document.pages.length;
        
        for (var i = 0; i < SIZES.length; ++ i) {
            var size = SIZES[i];
            var pageMatched = true;
            for (var j = 0; j < pageCount && pageMatched; ++ j) {
                pageMatched = pageMatchesSize(document.pages[j], size);
            }
            
            if (pageMatched) {
                return size;
            }
        }

        return undefined;
    }

    function http(host, method, path, content, contentType, progressHook) {
        var request = []

        if (progressHook) {
            progressHook('assembling content');
        }

        request.push(method, ' ', path, ' ', "HTTP/1.0\n");
        request.push('Host: ', host, "\n");
        request.push('User-Agent: ', USER_AGENT, "\n");
        request.push('Connection: ', 'close', "\n");
        if (content) {
            request.push('Content-Length: ', content.length, "\n");
            if (contentType) {
                request.push('Content-Type: ', contentType, "\n");
            }
        }
        request.push("\n");
        if (content) {
            request.push(content);
        }

        if (progressHook) {
            progressHook('sending content');
        }

        var socket = new Socket;
        socket.timeout = 60; //?

        if (!socket.open(host + ':80', 'BINARY')) {
            return {error: "could not connect to " + host};
        }

        for (var i = 0; i < request.length; ++ i) {
            socket.write(request[i]);
        }

        if (progressHook) {
            progressHook('waiting for response');
        }

        var bufferSize = 1; // kb
        var block = 1;

        var responseArray = []
        while (socket.connected && !socket.eof) {
            if (progressHook) {
                progressHook('reading response: ' + (block * bufferSize) + ' Kb');
            }

            var chars = socket.read(bufferSize * 1024);
            responseArray.push(chars);
            ++ block;
        }
        socket.close();

        var response = responseArray.join('');
        var statusLineOffset = response.indexOf("\r\n");
        var statusLine = response.substring(0, statusLineOffset);
        var status = statusLine.split(' ')[1];
        var bodyOffset = response.indexOf("\r\n\r\n");
        var body = response.substring(bodyOffset + 4);

        return {status: status, body: body};
    }

    function contentAndBoundaryForMultiPart(parts) {
        var boundary = Math.random();

        var contentArray = []

        for (var i = 0; i < parts.length; ++ i) {
            contentArray.push("--", boundary, "\r\n");
            var part = parts[i];

            if (part.value) {
                contentArray.push("Content-Disposition: form-data; name=\"", part.key, "\"\r\n\r\n", part.value, "\r\n");
            } else if (part.filePath) {
                var file = new File(part.filePath);
                file.encoding = "BINARY";
                file.open("r")
                var fileContents = file.read();
                file.close();

                contentArray.push("Content-Disposition: form-data; name=\"", part.key,
                                  "\"; filename=\"", part.filePath, "\"\r\n",
                                  "Content-Transfer-Encoding: binary\r\n",
                                  "Content-Type: ", part.contentType, "\r\n\r\n",
                                  fileContents, "\r\n");
            }
        }

        contentArray.push("--", boundary, "--");

        return {boundary: boundary, content: contentArray.join('')};
    }

    function uploadToMOO(filePath, progressHook) {
        var parts = [
            {key: 'method', value: 'moo.image.uploadImage'},
            {key: 'imageFile', filePath: filePath, contentType: 'application/pdf'}
        ];

        var contentAndBoundary = contentAndBoundaryForMultiPart(parts);

        var response = http(API_HOST, 'POST', '/api/service/',
                            contentAndBoundary.content, "multipart/form-data; boundary=" + contentAndBoundary.boundary, progressHook);

        if (response.hasOwnProperty('error') || !response.hasOwnProperty('status') || response.status != 200 || !response.hasOwnProperty('body')) {
            return null;
        }

        var parsedResponse = JSON.parse(response.body);

        if (!parsedResponse.hasOwnProperty('imageBasketItem')) {
            return null;
        }

        return parsedResponse.imageBasketItem;
    }

    function createPack(product, packData, progressHook) {
        var parameters = {
            method: 'moo.pack.createPack',
            product: product,
            pack: JSON.stringify(packData)
        };

        var message = {
            method: 'POST',
            action: 'http://' + API_HOST + '/api/service/',
            parameters: parameters
        };

        var accessor = {
            token: '',
            tokenSecret: '',
            consumerKey: API_KEY,
            consumerSecret: API_SECRET
        };

        OAuth.completeRequest(message, accessor);
        var content = OAuth.formEncode(message.parameters);

        var response = http(API_HOST, 'POST', '/api/service/', content, "application/x-www-form-urlencoded", progressHook);

        if (response.hasOwnProperty('error') || !response.hasOwnProperty('status') || response.status != 200 || !response.hasOwnProperty('body')) {
            return null;
        }

        var parsedResponse = JSON.parse(response.body);

        if (!parsedResponse.hasOwnProperty('dropIns')) {
            return null;
        }

        return parsedResponse.dropIns.preview;
    }

    function visit(url) {
        if (File.fs == "Macintosh") {
            var body = 'tell application "Finder"\ropen location "' + url + '"\rend tell';
            app.doScript(body,ScriptLanguage.APPLESCRIPT_LANGUAGE);
        } else {
            var body = 'dim objShell\rset objShell = CreateObject("Shell.Application")\rstr = "' + url + '"\robjShell.ShellExecute str, "", "", "open", 1';
            app.doScript(body,ScriptLanguage.VISUAL_BASIC);
        }
    }

    // Reset menu to known state

    var mainMenu = app.menus.item("$ID/Main");
    var fileMenu = mainMenu.menuElements.item("File");
    var exportForMenu = fileMenu.menuElements.item("Export for");

    try {
        mainMenu.submenus.item("MOO").remove();
        exportForMenu.menuElements.item("MOO...").remove(); //?
    } catch (myError) {
    }

    // Reset menu actions to known state
    app.scriptMenuActions.everyItem().remove();

    // Add menus/items

    var mooMenu = mainMenu.submenus.add("MOO");
    var newMenu = mooMenu.submenus.add("New");

    // Add pdf export preset

    try {
        app.pdfExportPresets.item(PDF_EXPORT_PRESET.name).remove();
    } catch (myError) {
    }

    app.pdfExportPresets.add(PDF_EXPORT_PRESET);

    // Add document presets and script actions

    for (var i = 0; i < SIZES.length; ++ i) {
        var size = SIZES[i];

        for (var orientation in ORIENTATIONS) {
            var documentPreset = documentPresetForSizeAndOrientation(size, ORIENTATIONS[orientation]);
            var documentPresetName = documentPreset.name;
            
            try {
                app.documentPresets.item(documentPresetName).remove();
            } catch (myError) {
            }
            
            app.documentPresets.add(documentPreset);
            
            var action = app.scriptMenuActions.add(documentPresetName);
            action.addEventListener('onInvoke', (function(documentPresetName, size) {
                return function() {
                    var document = app.documents.add(true, app.documentPresets.item(documentPresetName));
                    for (var sideType in SIDE_TYPES) {
                        masterForSideType(document, sideType);
                    }
		            try {
		                document.masterSpreads.itemByName('A-Master').remove();
		            } catch (myError) {
		            }
                    setSideTypeForPage(document, document.pages.item(0), 'details');
		            app.activeWindow.activePage = document.pages.item(0); // make the first 'real' page the activePage
                };
            })(documentPresetName, size));
            
            newMenu.menuItems.add(action);
        }
    }
    
    var addPageAction = function addPageAction(sideType) {
        return function() {
            try {
                var document = app.activeDocument;
            } catch (myError) {
                alert('Please select a document and try again.');
                return;
            }
            
            var size = sizeForDocument(document);
            
            if (size === undefined) {
                alert("This document isn't the right shape or size for MOO. Sorry!");
                return;
            }
            
            var page = document.pages.add();
            setSideTypeForPage(document, page, sideType);
        }
    };

    var changePageAction = function changePageAction(sideType) {
        return function() {
            try {
                var document = app.activeDocument;
            } catch (myError) {
                alert('Please select a document and try again.');
                return;
            }
            
            var size = sizeForDocument(document);
            
            if (size === undefined) {
                alert("This document isn't the right shape or size for MOO. Sorry!");
                return;
            }

            var page = null;
            try {
                var page = app.activeWindow.activePage;
            } catch (myError) {
                alert('Please select a page and try again.');
                return;
            }
            
            setSideTypeForPage(document, page, sideType);
        }
    };

    var uploadAction = function() {
        try {
            var document = app.activeDocument;
        } catch (myError) {
            alert('Please select a document and try again.');
            return;
        }

        var size = sizeForDocument(document);

        if (size === undefined) {
            alert("This document isn't the right shape or size for MOO. Sorry!");
            return;
        }

        if (!checkSideTypes(document)) {
            alert("Sorry, all sides must be 'details' or 'image' before this document can be sent to MOO.");
            return;
        }

        // (Re-)Add pdf export preset

        try {
            app.pdfExportPresets.item(PDF_EXPORT_PRESET.name).remove();
        } catch (myError) {
            alert("We can't install the correct PDF export settings!");
            return;
        }

        var now = new Date().getTime();

        app.pdfExportPresets.add(PDF_EXPORT_PRESET);

        var progressPanel = Window.find('palette', 'MOO');

        if (progressPanel === null) {
            progressPanel = new Window('palette', 'MOO');
            progressPanel.add('statictext', [0, 0, 320, 24], "Validating document",
                              {name: 'progressStatus'});
        }

        var progressStatus = progressPanel.findElement('progressStatus');
        progressPanel.show();

        try {
            var imageBasketItems = [];
            for (var i = 0; i < document.pages.length; ++ i) {
                var pageName = document.pages.item(i).name;
                pageName = pageName.replace(new RegExp(":","gi"), "_");

                progressStatus.text = "Exporting PDF for side " + (i + 1);
                progressPanel.update();

                app.pdfExportPreferences.pageRange = pageName;

                var file = undefined;

                try {
                    var filePath = Folder.temp + "/moo-export-" + now + "page-" + i + ".pdf";
                    file = new File(filePath);

                    document.exportFile(ExportFormat.pdfType, filePath, false, app.pdfExportPresets.item(PDF_EXPORT_PRESET.name));

                    progressStatus.text = "Uploading side " + (i + 1) + " to MOO";
                    progressPanel.update();

                    var imageBasketItem = uploadToMOO(file, function(update) {
                        progressStatus.text = "Uploading side " + (i + 1) + " to MOO: " + update;
                        progressPanel.update();
                    });

                    if (!imageBasketItem) {
                        progressPanel.hide();
                        alert('Sorry -- the upload to MOO failed. Try again later :(');
                        return;
                    }

                    imageBasketItems.push(imageBasketItem);
                } finally {
                    if (file) {
                        file.remove();
                    }
                }
            }

            progressStatus.text = "Creating pack";
            progressPanel.update();

            var packData = simplePack(document, imageBasketItems, size);

            var url = createPack(size.mooName, packData, function(update) {
                progressStatus.text = "Sending pack to MOO: " + update;
                progressPanel.update();
            });

            if (!url) {
                progressPanel.hide();
                alert('Sorry -- there was a problem with creating your pack. Try again later :(');
                return;
            }

            visit(url);

            // var completedDialog = new Window('dialog', 'Pack Ready');
            // var completedMessage = completedDialog.add('statictext');
            // completedMessage.text = "Your pack is available at " + url;
            // completedDialog.add('button', undefined, 'Yay!', {name: 'OK'});
            // completedDialog.show();

        } finally {
            progressPanel.hide();
        }
    };

    var addImageSide = app.scriptMenuActions.add("Add image side");
    addImageSide.addEventListener('onInvoke', addPageAction('image'));
    mooMenu.menuItems.add(addImageSide);

    var addDetailsSide = app.scriptMenuActions.add("Add details side");
    addDetailsSide.addEventListener('onInvoke', addPageAction('details'));
    mooMenu.menuItems.add(addDetailsSide);

    var changeToImageSide = app.scriptMenuActions.add("Change to image side");
    changeToImageSide.addEventListener('onInvoke', changePageAction('image'));
    mooMenu.menuItems.add(changeToImageSide);

    var changeToDetailsSide = app.scriptMenuActions.add("Change to details side");
    changeToDetailsSide.addEventListener('onInvoke', changePageAction('details'));
    mooMenu.menuItems.add(changeToDetailsSide);

    var sendToMoo = app.scriptMenuActions.add("Send to MOO...");
    sendToMoo.addEventListener('onInvoke', uploadAction);
    mooMenu.menuItems.add(sendToMoo);

    var exportForMoo = app.scriptMenuActions.add("MOO...");
    exportForMoo.addEventListener('onInvoke', uploadAction);
    exportForMenu.menuItems.add(exportForMoo);

    var uploadCheck = function uploadCheck() {
        var document = null;
        try {
            var document = app.activeDocument;
        } catch (myError) {
        }
        if (document && sizeForDocument(document)) {
            addImageSide.enabled = true;
            addDetailsSide.enabled = true;
            sendToMoo.enabled = true;
            exportForMoo.enabled = true;
        } else {
            addImageSide.enabled = false;
            addDetailsSide.enabled = false;
            sendToMoo.enabled = false;
            exportForMoo.enabled = false;
        }
    }

    var switchCheck = function switchCheck() {
        var document = null;
        try {
            var document = app.activeDocument;
        } catch (myError) {
        }

        if (document && sizeForDocument(document)) {
            var page = null;
            try {
                var page = app.activeWindow.activePage;
            } catch (myError) {
            }
            if (page) {
                changeToImageSide.enabled = sideTypeForPage(page) !== 'image';
                changeToDetailsSide.enabled = sideTypeForPage(page) !== 'details';
            }                
        } else {
            changeToImageSide.enabled = false;
            changeToDetailsSide.enabled = false;                
        }
    }
    
    addImageSide.addEventListener('beforeDisplay', uploadCheck);
    addDetailsSide.addEventListener('beforeDisplay', uploadCheck);
    sendToMoo.addEventListener('beforeDisplay', uploadCheck);
    exportForMoo.addEventListener('beforeDisplay', uploadCheck);
    changeToImageSide.addEventListener('beforeDisplay', switchCheck);
    changeToDetailsSide.addEventListener('beforeDisplay', switchCheck);

})();

//-----------------------------------------------------------------------------

/*
 * Copyright 2008 Netflix, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* Here's some JavaScript software for implementing OAuth.

   This isn't as useful as you might hope.  OAuth is based around
   allowing tools and websites to talk to each other.  However,
   JavaScript running in web browsers is hampered by security
   restrictions that prevent code running on one website from
   accessing data stored or served on another.

   Before you start hacking, make sure you understand the limitations
   posed by cross-domain XMLHttpRequest.

   On the bright side, some platforms use JavaScript as their
   language, but enable the programmer to access other web sites.
   Examples include Google Gadgets, and Microsoft Vista Sidebar.
   For those platforms, this library should come in handy.
*/

// The HMAC-SHA1 signature method calls b64_hmac_sha1, defined by
// http://pajhome.org.uk/crypt/md5/sha1.js

/* An OAuth message is represented as an object like this:
   {method: "GET", action: "http://server.com/path", parameters: ...}

   The parameters may be either a map {name: value, name2: value2}
   or an Array of name-value pairs [[name, value], [name2, value2]].
   The latter representation is more powerful: it supports parameters
   in a specific sequence, or several parameters with the same name;
   for example [["a", 1], ["b", 2], ["a", 3]].

   Parameter names and values are NOT percent-encoded in an object.
   They must be encoded before transmission and decoded after reception.
   For example, this message object:
   {method: "GET", action: "http://server/path", parameters: {p: "x y"}}
   ... can be transmitted as an HTTP request that begins:
   GET /path?p=x%20y HTTP/1.0
   (This isn't a valid OAuth request, since it lacks a signature etc.)
   Note that the object "x y" is transmitted as x%20y.  To encode
   parameters, you can call OAuth.addToURL, OAuth.formEncode or
   OAuth.getAuthorization.

   This message object model harmonizes with the browser object model for
   input elements of an form, whose value property isn't percent encoded.
   The browser encodes each value before transmitting it. For example,
   see consumer.setInputs in example/consumer.js.
 */

/* This script needs to know what time it is. By default, it uses the local
   clock (new Date), which is apt to be inaccurate in browsers. To do
   better, you can load this script from a URL whose query string contains
   an oauth_timestamp parameter, whose value is a current Unix timestamp.
   For example, when generating the enclosing document using PHP:

   <script src="oauth.js?oauth_timestamp=<?=time()?>" ...

   Another option is to call OAuth.correctTimestamp with a Unix timestamp.
 */

var OAuth; if (OAuth == null) OAuth = {};

OAuth.setProperties = function setProperties(into, from) {
    if (into != null && from != null) {
        for (var key in from) {
            into[key] = from[key];
        }
    }
    return into;
}

OAuth.setProperties(OAuth, // utility functions
{
    percentEncode: function percentEncode(s) {
        if (s == null) {
            return "";
        }
        if (s instanceof Array) {
            var e = "";
            for (var i = 0; i < s.length; ++s) {
                if (e != "") e += '&';
                e += OAuth.percentEncode(s[i]);
            }
            return e;
        }

    // http://bytes.com/topic/javascript/answers/739466-url-encoding-string-code-worth-recommending-project
        s = encodeURIComponent(s).replace(/(.{0,3})(%0A)/g, function(m, p1, p2) {
        return p1 + (p1 == '%0D' ? '' : '%0D') + p2;
    });

        // Now replace the values which encodeURIComponent doesn't do
        // encodeURIComponent ignores: - _ . ! ~ * ' ( )
        // OAuth dictates the only ones you can ignore are: - _ . ~
        // Source: http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Functions:encodeURIComponent
        s = s.replace(/\!/g, "%21");
        s = s.replace(/\*/g, "%2A");
        s = s.replace(/\'/g, "%27");
        s = s.replace(/\(/g, "%28");
        s = s.replace(/\)/g, "%29");
        return s;
    }
,
    decodePercent: function decodePercent(s) {
        if (s != null) {
            // Handle application/x-www-form-urlencoded, which is defined by
            // http://www.w3.org/TR/html4/interact/forms.html#h-17.13.4.1
            s = s.replace(/\+/g, " ");
        }
        return decodeURIComponent(s);
    }
,
    /** Convert the given parameters to an Array of name-value pairs. */
    getParameterList: function getParameterList(parameters) {
        if (parameters == null) {
            return [];
        }
        if (typeof parameters != "object") {
            return OAuth.decodeForm(parameters + "");
        }
        if (parameters instanceof Array) {
            return parameters;
        }
        var list = [];
        for (var p in parameters) {
            list.push([p, parameters[p]]);
        }
        return list;
    }
,
    /** Convert the given parameters to a map from name to value. */
    getParameterMap: function getParameterMap(parameters) {
        if (parameters == null) {
            return {};
        }
        if (typeof parameters != "object") {
            return OAuth.getParameterMap(OAuth.decodeForm(parameters + ""));
        }
        if (parameters instanceof Array) {
            var map = {};
            for (var p = 0; p < parameters.length; ++p) {
                var key = parameters[p][0];
                if (map[key] === undefined) { // first value wins
                    map[key] = parameters[p][1];
                }
            }
            return map;
        }
        return parameters;
    }
,
    getParameter: function getParameter(parameters, name) {
        if (parameters instanceof Array) {
            for (var p = 0; p < parameters.length; ++p) {
                if (parameters[p][0] == name) {
                    return parameters[p][1]; // first value wins
                }
            }
        } else {
            return OAuth.getParameterMap(parameters)[name];
        }
        return null;
    }
,
    formEncode: function formEncode(parameters) {
        var form = "";
        var list = OAuth.getParameterList(parameters);
        for (var p = 0; p < list.length; ++p) {
            var value = list[p][1];
            if (value == null) value = "";
            if (form != "") form += '&';
            form += OAuth.percentEncode(list[p][0])
              +'='+ OAuth.percentEncode(value);
        }
        return form;
    }
,
    decodeForm: function decodeForm(form) {
        var list = [];
        var nvps = form.split('&');
        for (var n = 0; n < nvps.length; ++n) {
            var nvp = nvps[n];
            if (nvp == "") {
                continue;
            }
            var equals = nvp.indexOf('=');
            var name;
            var value;
            if (equals < 0) {
                name = OAuth.decodePercent(nvp);
                value = null;
            } else {
                name = OAuth.decodePercent(nvp.substring(0, equals));
                value = OAuth.decodePercent(nvp.substring(equals + 1));
            }
            list.push([name, value]);
        }
        return list;
    }
,
    setParameter: function setParameter(message, name, value) {
        var parameters = message.parameters;
        if (parameters instanceof Array) {
            for (var p = 0; p < parameters.length; ++p) {
                if (parameters[p][0] == name) {
                    if (value === undefined) {
                        parameters.splice(p, 1);
                    } else {
                        parameters[p][1] = value;
                        value = undefined;
                    }
                }
            }
            if (value !== undefined) {
                parameters.push([name, value]);
            }
        } else {
            parameters = OAuth.getParameterMap(parameters);
            parameters[name] = value;
            message.parameters = parameters;
        }
    }
,
    setParameters: function setParameters(message, parameters) {
        var list = OAuth.getParameterList(parameters);
        for (var i = 0; i < list.length; ++i) {
            OAuth.setParameter(message, list[i][0], list[i][1]);
        }
    }
,
    /** Fill in parameters to help construct a request message.
        This function doesn't fill in every parameter.
        The accessor object should be like:
        {consumerKey:'foo', consumerSecret:'bar', accessorSecret:'nurn', token:'krelm', tokenSecret:'blah'}
        The accessorSecret property is optional.
     */
    completeRequest: function completeRequest(message, accessor) {
        if (message.method == null) {
            message.method = "GET";
        }
        var map = OAuth.getParameterMap(message.parameters);
        if (map.oauth_consumer_key == null) {
            OAuth.setParameter(message, "oauth_consumer_key", accessor.consumerKey || "");
        }
        if (map.oauth_token == null && accessor.token != null) {
            OAuth.setParameter(message, "oauth_token", accessor.token);
        }
        if (map.oauth_version == null) {
            OAuth.setParameter(message, "oauth_version", "1.0");
        }
        if (map.oauth_timestamp == null) {
            OAuth.setParameter(message, "oauth_timestamp", OAuth.timestamp());
        }
        if (map.oauth_nonce == null) {
            OAuth.setParameter(message, "oauth_nonce", OAuth.nonce(6));
        }
        OAuth.SignatureMethod.sign(message, accessor);
    }
,
    setTimestampAndNonce: function setTimestampAndNonce(message) {
        OAuth.setParameter(message, "oauth_timestamp", OAuth.timestamp());
        OAuth.setParameter(message, "oauth_nonce", OAuth.nonce(6));
    }
,
    addToURL: function addToURL(url, parameters) {
        newURL = url;
        if (parameters != null) {
            var toAdd = OAuth.formEncode(parameters);
            if (toAdd.length > 0) {
                var q = url.indexOf('?');
                if (q < 0) newURL += '?';
                else       newURL += '&';
                newURL += toAdd;
            }
        }
        return newURL;
    }
,
    /** Construct the value of the Authorization header for an HTTP request. */
    getAuthorizationHeader: function getAuthorizationHeader(realm, parameters) {
        var header = 'OAuth realm="' + OAuth.percentEncode(realm) + '"';
        var list = OAuth.getParameterList(parameters);
        for (var p = 0; p < list.length; ++p) {
            var parameter = list[p];
            var name = parameter[0];
            if (name.indexOf("oauth_") == 0) {
                header += ',' + OAuth.percentEncode(name) + '="' + OAuth.percentEncode(parameter[1]) + '"';
            }
        }
        return header;
    }
,
    /** Correct the time using a parameter from the URL from which the last script was loaded. */
    correctTimestampFromSrc: function correctTimestampFromSrc(parameterName) {
        parameterName = parameterName || "oauth_timestamp";
        var scripts = document.getElementsByTagName('script');
        if (scripts == null || !scripts.length) return;
        var src = scripts[scripts.length-1].src;
        if (!src) return;
        var q = src.indexOf("?");
        if (q < 0) return;
        parameters = OAuth.getParameterMap(OAuth.decodeForm(src.substring(q+1)));
        var t = parameters[parameterName];
        if (t == null) return;
        OAuth.correctTimestamp(t);
    }
,
    /** Generate timestamps starting with the given value. */
    correctTimestamp: function correctTimestamp(timestamp) {
        OAuth.timeCorrectionMsec = (timestamp * 1000) - (new Date()).getTime();
    }
,
    /** The difference between the correct time and my clock. */
    timeCorrectionMsec: 0
,
    timestamp: function timestamp() {
        var t = (new Date()).getTime() + OAuth.timeCorrectionMsec;
        return Math.floor(t / 1000);
    }
,
    nonce: function nonce(length) {
        var chars = OAuth.nonce.CHARS;
        var result = "";
        for (var i = 0; i < length; ++i) {
            var rnum = Math.floor(Math.random() * chars.length);
            result += chars.substring(rnum, rnum+1);
        }
        return result;
    }
});

OAuth.nonce.CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";

/** Define a constructor function,
    without causing trouble to anyone who was using it as a namespace.
    That is, if parent[name] already existed and had properties,
    copy those properties into the new constructor.
 */
OAuth.declareClass = function declareClass(parent, name, newConstructor) {
    var previous = parent[name];
    parent[name] = newConstructor;
    if (newConstructor != null && previous != null) {
        for (var key in previous) {
            if (key != "prototype") {
                newConstructor[key] = previous[key];
            }
        }
    }
    return newConstructor;
}

/** An abstract algorithm for signing messages. */
OAuth.declareClass(OAuth, "SignatureMethod", function OAuthSignatureMethod(){});

OAuth.setProperties(OAuth.SignatureMethod.prototype, // instance members
{
    /** Add a signature to the message. */
    sign: function sign(message) {
        var baseString = OAuth.SignatureMethod.getBaseString(message);
        var signature = this.getSignature(baseString);
        OAuth.setParameter(message, "oauth_signature", signature);
        return signature; // just in case someone's interested
    }
,
    /** Set the key string for signing. */
    initialize: function initialize(name, accessor) {
        var consumerSecret;
        if (accessor.accessorSecret != null
            && name.length > 9
            && name.substring(name.length-9) == "-Accessor")
        {
            consumerSecret = accessor.accessorSecret;
        } else {
            consumerSecret = accessor.consumerSecret;
        }
        this.key = OAuth.percentEncode(consumerSecret)
             +"&"+ OAuth.percentEncode(accessor.tokenSecret);
    }
});

/* SignatureMethod expects an accessor object to be like this:
   {tokenSecret: "lakjsdflkj...", consumerSecret: "QOUEWRI..", accessorSecret: "xcmvzc..."}
   The accessorSecret property is optional.
 */
// Class members:
OAuth.setProperties(OAuth.SignatureMethod, // class members
{
    sign: function sign(message, accessor) {
        var name = OAuth.getParameterMap(message.parameters).oauth_signature_method;
        if (name == null || name == "") {
            name = "HMAC-SHA1";
            OAuth.setParameter(message, "oauth_signature_method", name);
        }
        OAuth.SignatureMethod.newMethod(name, accessor).sign(message);
    }
,
    /** Instantiate a SignatureMethod for the given method name. */
    newMethod: function newMethod(name, accessor) {
        var impl = OAuth.SignatureMethod.REGISTERED[name];
        if (impl != null) {
            var method = new impl();
            method.initialize(name, accessor);
            return method;
        }
        var err = new Error("signature_method_rejected");
        var acceptable = "";
        for (var r in OAuth.SignatureMethod.REGISTERED) {
            if (acceptable != "") acceptable += '&';
            acceptable += OAuth.percentEncode(r);
        }
        err.oauth_acceptable_signature_methods = acceptable;
        throw err;
    }
,
    /** A map from signature method name to constructor. */
    REGISTERED : {}
,
    /** Subsequently, the given constructor will be used for the named methods.
        The constructor will be called with no parameters.
        The resulting object should usually implement getSignature(baseString).
        You can easily define such a constructor by calling makeSubclass, below.
     */
    registerMethodClass: function registerMethodClass(names, classConstructor) {
        for (var n = 0; n < names.length; ++n) {
            OAuth.SignatureMethod.REGISTERED[names[n]] = classConstructor;
        }
    }
,
    /** Create a subclass of OAuth.SignatureMethod, with the given getSignature function. */
    makeSubclass: function makeSubclass(getSignatureFunction) {
        var superClass = OAuth.SignatureMethod;
        var subClass = function() {
            superClass.call(this);
        };
        subClass.prototype = new superClass();
        // Delete instance variables from prototype:
        // delete subclass.prototype... There aren't any.
        subClass.prototype.getSignature = getSignatureFunction;
        subClass.prototype.constructor = subClass;
        return subClass;
    }
,
    getBaseString: function getBaseString(message) {
        var URL = message.action;
        var q = URL.indexOf('?');
        var parameters;
        if (q < 0) {
            parameters = message.parameters;
        } else {
            // Combine the URL query string with the other parameters:
            parameters = OAuth.decodeForm(URL.substring(q + 1));
            var toAdd = OAuth.getParameterList(message.parameters);
            for (var a = 0; a < toAdd.length; ++a) {
                parameters.push(toAdd[a]);
            }
        }
        return OAuth.percentEncode(message.method.toUpperCase())
         +'&'+ OAuth.percentEncode(OAuth.SignatureMethod.normalizeUrl(URL))
         +'&'+ OAuth.percentEncode(OAuth.SignatureMethod.normalizeParameters(parameters));
    }
,
    normalizeUrl: function normalizeUrl(url) {
        var uri = OAuth.SignatureMethod.parseUri(url);
        var scheme = uri.protocol.toLowerCase();
        var authority = uri.authority.toLowerCase();
        var dropPort = (scheme == "http" && uri.port == 80)
                    || (scheme == "https" && uri.port == 443);
        if (dropPort) {
            // find the last : in the authority
            var index = authority.lastIndexOf(":");
            if (index >= 0) {
                authority = authority.substring(0, index);
            }
        }
        var path = uri.path;
        if (!path) {
            path = "/"; // conforms to RFC 2616 section 3.2.2
        }
        // we know that there is no query and no fragment here.
        return scheme + "://" + authority + path;
    }
,
    parseUri: function parseUri (str) {
        /* This function was adapted from parseUri 1.2.1
           http://stevenlevithan.com/demo/parseuri/js/assets/parseuri.js
         */
        var o = {key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
                 parser: {strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@\/]*):?([^:@\/]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/ }};
        var m = o.parser.strict.exec(str);
        var uri = {};
        var i = 14;
        while (i--) uri[o.key[i]] = m[i] || "";
        return uri;
    }
,
    normalizeParameters: function normalizeParameters(parameters) {
        if (parameters == null) {
            return "";
        }
        var list = OAuth.getParameterList(parameters);
        var sortable = [];
        for (var p = 0; p < list.length; ++p) {
            var nvp = list[p];
            if (nvp[0] != "oauth_signature") {
                sortable.push([ OAuth.percentEncode(nvp[0])
                              + " " // because it comes before any character that can appear in a percentEncoded string.
                              + OAuth.percentEncode(nvp[1])
                              , nvp]);
            }
        }
        sortable.sort(function(a,b) {
                          if (a[0] < b[0]) return  -1;
                          if (a[0] > b[0]) return 1;
                          return 0;
                      });
        var sorted = [];
        for (var s = 0; s < sortable.length; ++s) {
            sorted.push(sortable[s][1]);
        }
        return OAuth.formEncode(sorted);
    }
});

OAuth.SignatureMethod.registerMethodClass(["PLAINTEXT", "PLAINTEXT-Accessor"],
    OAuth.SignatureMethod.makeSubclass(
        function getSignature(baseString) {
            return this.key;
        }
    ));

OAuth.SignatureMethod.registerMethodClass(["HMAC-SHA1", "HMAC-SHA1-Accessor"],
    OAuth.SignatureMethod.makeSubclass(
        function getSignature(baseString) {
            b64pad = '=';
            var signature = b64_hmac_sha1(this.key, baseString);
            return signature;
        }
    ));

try {
    OAuth.correctTimestampFromSrc();
} catch(e) {
}
//-----------------------------------------------------------------------------


// glue

function b64_hmac_sha1(key, baseString) {
    var result = new JS_SHA(baseString, 'ASCII').getHMAC(key, 'ASCII', 'SHA-1', 'B64');
    return result;
}
//-----------------------------------------------------------------------------


/* A JavaScript implementation of the SHA family of hashes, as defined in FIPS
 * PUB 180-2 as well as the corresponding HMAC implementation as defined in
 * FIPS PUB 198a
 *
 * Version 1.3 Copyright Brian Turek 2008-2010
 * Distributed under the BSD License
 * See http://jssha.sourceforge.net/ for more information
 *
 * Several functions taken from Paul Johnson
 */

var JS_SHA; if (JS_SHA == null) JS_SHA = {};

(function ()
{
    /*
     * Configurable variables. Defaults typically work
     */
    /* Number of Bits Per character (8 for ASCII, 16 for Unicode) */
    var charSize = 8,
    /* base-64 pad character. "=" for strict RFC compliance */
    b64pad = "",
    /* hex output format. 0 - lowercase; 1 - uppercase */
    hexCase = 0,

    /*
     * Int_64 is a object for 2 32-bit numbers emulating a 64-bit number
     *
     * @constructor
     * @param {Number} msint_32 The most significant 32-bits of a 64-bit number
     * @param {Number} lsint_32 The least significant 32-bits of a 64-bit number
     */
    Int_64 = function (msint_32, lsint_32)
    {
        this.highOrder = msint_32;
        this.lowOrder = lsint_32;
    },

    /*
     * Convert a string to an array of big-endian words
     * If charSize is ASCII, characters >255 have their hi-byte silently
     * ignored.
     *
     * @param {String} str String to be converted to binary representation
     * @return Integer array representation of the parameter
     */
    str2binb = function (str)
    {
        var bin = [], mask = (1 << charSize) - 1,
            length = str.length * charSize, i;

        for (i = 0; i < length; i += charSize)
        {
            bin[i >> 5] |= (str.charCodeAt(i / charSize) & mask) <<
                (32 - charSize - (i % 32));
        }

        return bin;
    },

    /*
     * Convert a hex string to an array of big-endian words
     *
     * @param {String} str String to be converted to binary representation
     * @return Integer array representation of the parameter
     */
    hex2binb = function (str)
    {
        var bin = [], length = str.length, i, num;

        for (i = 0; i < length; i += 2)
        {
            num = parseInt(str.substr(i, 2), 16);
            if (!isNaN(num))
            {
                bin[i >> 3] |= num << (24 - (4 * (i % 8)));
            }
            else
            {
                return "INVALID HEX STRING";
            }
        }

        return bin;
    },

    /*
     * Convert an array of big-endian words to a hex string.
     *
     * @private
     * @param {Array} binarray Array of integers to be converted to hexidecimal
     *   representation
     * @return Hexidecimal representation of the parameter in String form
     */
    binb2hex = function (binarray)
    {
        var hex_tab = (hexCase) ? "0123456789ABCDEF" : "0123456789abcdef",
            str = "", length = binarray.length * 4, i, srcByte;

        for (i = 0; i < length; i += 1)
        {
            srcByte = binarray[i >> 2] >> ((3 - (i % 4)) * 8);
            str += hex_tab.charAt((srcByte >> 4) & 0xF) +
                hex_tab.charAt(srcByte & 0xF);
        }

        return str;
    },

    /*
     * Convert an array of big-endian words to a base-64 string
     *
     * @private
     * @param {Array} binarray Array of integers to be converted to base-64
     *   representation
     * @return Base-64 encoded representation of the parameter in String form
     */
    binb2b64 = function (binarray)
    {
        var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
            "0123456789+/", str = "", length = binarray.length * 4, i, j,
            triplet;

        for (i = 0; i < length; i += 3)
        {
            triplet = (((binarray[i >> 2] >> 8 * (3 - i % 4)) & 0xFF) << 16) |
                (((binarray[i + 1 >> 2] >> 8 * (3 - (i + 1) % 4)) & 0xFF) << 8) |
                ((binarray[i + 2 >> 2] >> 8 * (3 - (i + 2) % 4)) & 0xFF);
            for (j = 0; j < 4; j += 1)
            {
                if (i * 8 + j * 6 <= binarray.length * 32)
                {
                    str += tab.charAt((triplet >> 6 * (3 - j)) & 0x3F);
                }
                else
                {
                    str += b64pad;
                }
            }
        }
        return str;
    },

    /*
     * The 32-bit implementation of circular rotate left
     *
     * @private
     * @param {Number} x The 32-bit integer argument
     * @param {Number} n The number of bits to shift
     * @return The x shifted circularly by n bits
     */
    rotl_32 = function (x, n)
    {
        return (x << n) | (x >>> (32 - n));
    },

    /*
     * The 32-bit implementation of circular rotate right
     *
     * @private
     * @param {Number} x The 32-bit integer argument
     * @param {Number} n The number of bits to shift
     * @return The x shifted circularly by n bits
     */
    rotr_32 = function (x, n)
    {
        return (x >>> n) | (x << (32 - n));
    },

    /*
     * The 64-bit implementation of circular rotate right
     *
     * @private
     * @param {Int_64} x The 64-bit integer argument
     * @param {Number} n The number of bits to shift
     * @return The x shifted circularly by n bits
     */
    rotr_64 = function (x, n)
    {
        if (n <= 32)
        {
            return new Int_64(
                    (x.highOrder >>> n) | (x.lowOrder << (32 - n)),
                    (x.lowOrder >>> n) | (x.highOrder << (32 - n))
                );
        }
        else
        {
            return new Int_64(
                    (x.lowOrder >>> n) | (x.highOrder << (32 - n)),
                    (x.highOrder >>> n) | (x.lowOrder << (32 - n))
                );
        }
    },

    /*
     * The 32-bit implementation of shift right
     *
     * @private
     * @param {Number} x The 32-bit integer argument
     * @param {Number} n The number of bits to shift
     * @return The x shifted by n bits
     */
    shr_32 = function (x, n)
    {
        return x >>> n;
    },

    /*
     * The 64-bit implementation of shift right
     *
     * @private
     * @param {Int_64} x The 64-bit integer argument
     * @param {Number} n The number of bits to shift
     * @return The x shifted by n bits
     */
    shr_64 = function (x, n)
    {
        if (n <= 32)
        {
            return new Int_64(
                    x.highOrder >>> n,
                    x.lowOrder >>> n | (x.highOrder << (32 - n))
                );
        }
        else
        {
            return new Int_64(
                    0,
                    x.highOrder << (32 - n)
                );
        }
    },

    /*
     * The 32-bit implementation of the NIST specified Parity function
     *
     * @private
     * @param {Number} x The first 32-bit integer argument
     * @param {Number} y The second 32-bit integer argument
     * @param {Number} z The third 32-bit integer argument
     * @return The NIST specified output of the function
     */
    parity_32 = function (x, y, z)
    {
        return x ^ y ^ z;
    },

    /*
     * The 32-bit implementation of the NIST specified Ch function
     *
     * @private
     * @param {Number} x The first 32-bit integer argument
     * @param {Number} y The second 32-bit integer argument
     * @param {Number} z The third 32-bit integer argument
     * @return The NIST specified output of the function
     */
    ch_32 = function (x, y, z)
    {
        return (x & y) ^ (~x & z);
    },

    /*
     * The 64-bit implementation of the NIST specified Ch function
     *
     * @private
     * @param {Int_64} x The first 64-bit integer argument
     * @param {Int_64} y The second 64-bit integer argument
     * @param {Int_64} z The third 64-bit integer argument
     * @return The NIST specified output of the function
     */
    ch_64 = function (x, y, z)
    {
        return new Int_64(
                (x.highOrder & y.highOrder) ^ (~x.highOrder & z.highOrder),
                (x.lowOrder & y.lowOrder) ^ (~x.lowOrder & z.lowOrder)
            );
    },

    /*
     * The 32-bit implementation of the NIST specified Maj function
     *
     * @private
     * @param {Number} x The first 32-bit integer argument
     * @param {Number} y The second 32-bit integer argument
     * @param {Number} z The third 32-bit integer argument
     * @return The NIST specified output of the function
     */
    maj_32 = function (x, y, z)
    {
        return (x & y) ^ (x & z) ^ (y & z);
    },

    /*
     * The 64-bit implementation of the NIST specified Maj function
     *
     * @private
     * @param {Int_64} x The first 64-bit integer argument
     * @param {Int_64} y The second 64-bit integer argument
     * @param {Int_64} z The third 64-bit integer argument
     * @return The NIST specified output of the function
     */
    maj_64 = function (x, y, z)
    {
        return new Int_64(
                (x.highOrder & y.highOrder) ^
                (x.highOrder & z.highOrder) ^
                (y.highOrder & z.highOrder),
                (x.lowOrder & y.lowOrder) ^
                (x.lowOrder & z.lowOrder) ^
                (y.lowOrder & z.lowOrder)
            );
    },

    /*
     * The 32-bit implementation of the NIST specified Sigma0 function
     *
     * @private
     * @param {Number} x The 32-bit integer argument
     * @return The NIST specified output of the function
     */
    sigma0_32 = function (x)
    {
        return rotr_32(x, 2) ^ rotr_32(x, 13) ^ rotr_32(x, 22);
    },

    /*
     * The 64-bit implementation of the NIST specified Sigma0 function
     *
     * @private
     * @param {Int_64} x The 64-bit integer argument
     * @return The NIST specified output of the function
     */
    sigma0_64 = function (x)
    {
        var rotr28 = rotr_64(x, 28), rotr34 = rotr_64(x, 34),
            rotr39 = rotr_64(x, 39);

        return new Int_64(
                rotr28.highOrder ^ rotr34.highOrder ^ rotr39.highOrder,
                rotr28.lowOrder ^ rotr34.lowOrder ^ rotr39.lowOrder);
    },

    /*
     * The 32-bit implementation of the NIST specified Sigma1 function
     *
     * @private
     * @param {Number} x The 32-bit integer argument
     * @return The NIST specified output of the function
     */
    sigma1_32 = function (x)
    {
        return rotr_32(x, 6) ^ rotr_32(x, 11) ^ rotr_32(x, 25);
    },

    /*
     * The 64-bit implementation of the NIST specified Sigma1 function
     *
     * @private
     * @param {Int_64} x The 64-bit integer argument
     * @return The NIST specified output of the function
     */
    sigma1_64 = function (x)
    {
        var rotr14 = rotr_64(x, 14), rotr18 = rotr_64(x, 18),
            rotr41 = rotr_64(x, 41);

        return new Int_64(
                rotr14.highOrder ^ rotr18.highOrder ^ rotr41.highOrder,
                rotr14.lowOrder ^ rotr18.lowOrder ^ rotr41.lowOrder);
    },

    /*
     * The 32-bit implementation of the NIST specified Gamma0 function
     *
     * @private
     * @param {Number} x The 32-bit integer argument
     * @return The NIST specified output of the function
     */
    gamma0_32 = function (x)
    {
        return rotr_32(x, 7) ^ rotr_32(x, 18) ^ shr_32(x, 3);
    },

    /*
     * The 64-bit implementation of the NIST specified Gamma0 function
     *
     * @private
     * @param {Int_64} x The 64-bit integer argument
     * @return The NIST specified output of the function
     */
    gamma0_64 = function (x)
    {
        var rotr1 = rotr_64(x, 1), rotr8 = rotr_64(x, 8), shr7 = shr_64(x, 7);

        return new Int_64(
                rotr1.highOrder ^ rotr8.highOrder ^ shr7.highOrder,
                rotr1.lowOrder ^ rotr8.lowOrder ^ shr7.lowOrder
            );
    },

    /*
     * The 32-bit implementation of the NIST specified Gamma1 function
     *
     * @private
     * @param {Number} x The 32-bit integer argument
     * @return The NIST specified output of the function
     */
    gamma1_32 = function (x)
    {
        return rotr_32(x, 17) ^ rotr_32(x, 19) ^ shr_32(x, 10);
    },

    /*
     * The 64-bit implementation of the NIST specified Gamma1 function
     *
     * @private
     * @param {Int_64} x The 64-bit integer argument
     * @return The NIST specified output of the function
     */
    gamma1_64 = function (x)
    {
        var rotr19 = rotr_64(x, 19), rotr61 = rotr_64(x, 61),
            shr6 = shr_64(x, 6);

        return new Int_64(
                rotr19.highOrder ^ rotr61.highOrder ^ shr6.highOrder,
                rotr19.lowOrder ^ rotr61.lowOrder ^ shr6.lowOrder
            );
    },

    /*
     * Add two 32-bit integers, wrapping at 2^32. This uses 16-bit operations
     * internally to work around bugs in some JS interpreters.
     *
     * @private
     * @param {Number} x The first 32-bit integer argument to be added
     * @param {Number} y The second 32-bit integer argument to be added
     * @return The sum of x + y
     */
    safeAdd_32_2 = function (x, y)
    {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF),
            msw = (x >>> 16) + (y >>> 16) + (lsw >>> 16);

        return ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);
    },

    /*
     * Add four 32-bit integers, wrapping at 2^32. This uses 16-bit operations
     * internally to work around bugs in some JS interpreters.
     *
     * @private
     * @param {Number} a The first 32-bit integer argument to be added
     * @param {Number} b The second 32-bit integer argument to be added
     * @param {Number} c The third 32-bit integer argument to be added
     * @param {Number} d The fourth 32-bit integer argument to be added
     * @return The sum of a + b + c + d
     */
    safeAdd_32_4 = function (a, b, c, d)
    {
        var lsw = (a & 0xFFFF) + (b & 0xFFFF) + (c & 0xFFFF) + (d & 0xFFFF),
            msw = (a >>> 16) + (b >>> 16) + (c >>> 16) + (d >>> 16) +
                (lsw >>> 16);

        return ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);
    },

    /*
     * Add five 32-bit integers, wrapping at 2^32. This uses 16-bit operations
     * internally to work around bugs in some JS interpreters.
     *
     * @private
     * @param {Number} a The first 32-bit integer argument to be added
     * @param {Number} b The second 32-bit integer argument to be added
     * @param {Number} c The third 32-bit integer argument to be added
     * @param {Number} d The fourth 32-bit integer argument to be added
     * @param {Number} e The fifth 32-bit integer argument to be added
     * @return The sum of a + b + c + d + e
     */
    safeAdd_32_5 = function (a, b, c, d, e)
    {
        var lsw = (a & 0xFFFF) + (b & 0xFFFF) + (c & 0xFFFF) + (d & 0xFFFF) +
                (e & 0xFFFF),
            msw = (a >>> 16) + (b >>> 16) + (c >>> 16) + (d >>> 16) +
                (e >>> 16) + (lsw >>> 16);

        return ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);
    },

    /*
     * Add two 64-bit integers, wrapping at 2^64. This uses 16-bit operations
     * internally to work around bugs in some JS interpreters.
     *
     * @private
     * @param {Int_64} x The first 64-bit integer argument to be added
     * @param {Int_64} y The second 64-bit integer argument to be added
     * @return The sum of x + y
     */
    safeAdd_64_2 = function (x, y)
    {
        var lsw, msw, lowOrder, highOrder;

        lsw = (x.lowOrder & 0xFFFF) + (y.lowOrder & 0xFFFF);
        msw = (x.lowOrder >>> 16) + (y.lowOrder >>> 16) + (lsw >>> 16);
        lowOrder = ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);

        lsw = (x.highOrder & 0xFFFF) + (y.highOrder & 0xFFFF) + (msw >>> 16);
        msw = (x.highOrder >>> 16) + (y.highOrder >>> 16) + (lsw >>> 16);
        highOrder = ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);

        return new Int_64(highOrder, lowOrder);
    },

    /*
     * Add four 64-bit integers, wrapping at 2^64. This uses 16-bit operations
     * internally to work around bugs in some JS interpreters.
     *
     * @private
     * @param {Int_64} a The first 64-bit integer argument to be added
     * @param {Int_64} b The second 64-bit integer argument to be added
     * @param {Int_64} c The third 64-bit integer argument to be added
     * @param {Int_64} d The fouth 64-bit integer argument to be added
     * @return The sum of a + b + c + d
     */
    safeAdd_64_4 = function (a, b, c, d)
    {
        var lsw, msw, lowOrder, highOrder;

        lsw = (a.lowOrder & 0xFFFF) + (b.lowOrder & 0xFFFF) +
            (c.lowOrder & 0xFFFF) + (d.lowOrder & 0xFFFF);
        msw = (a.lowOrder >>> 16) + (b.lowOrder >>> 16) +
            (c.lowOrder >>> 16) + (d.lowOrder >>> 16) + (lsw >>> 16);
        lowOrder = ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);

        lsw = (a.highOrder & 0xFFFF) + (b.highOrder & 0xFFFF) +
            (c.highOrder & 0xFFFF) + (d.highOrder & 0xFFFF) + (msw >>> 16);
        msw = (a.highOrder >>> 16) + (b.highOrder >>> 16) +
            (c.highOrder >>> 16) + (d.highOrder >>> 16) + (lsw >>> 16);
        highOrder = ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);

        return new Int_64(highOrder, lowOrder);
    },

    /*
     * Add five 64-bit integers, wrapping at 2^64. This uses 16-bit operations
     * internally to work around bugs in some JS interpreters.
     *
     * @private
     * @param {Int_64} a The first 64-bit integer argument to be added
     * @param {Int_64} b The second 64-bit integer argument to be added
     * @param {Int_64} c The third 64-bit integer argument to be added
     * @param {Int_64} d The fouth 64-bit integer argument to be added
     * @param {Int_64} e The fouth 64-bit integer argument to be added
     * @return The sum of a + b + c + d + e
     */
    safeAdd_64_5 = function (a, b, c, d, e)
    {
        var lsw, msw, lowOrder, highOrder;

        lsw = (a.lowOrder & 0xFFFF) + (b.lowOrder & 0xFFFF) +
            (c.lowOrder & 0xFFFF) + (d.lowOrder & 0xFFFF) +
            (e.lowOrder & 0xFFFF);
        msw = (a.lowOrder >>> 16) + (b.lowOrder >>> 16) +
            (c.lowOrder >>> 16) + (d.lowOrder >>> 16) + (e.lowOrder >>> 16) +
            (lsw >>> 16);
        lowOrder = ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);

        lsw = (a.highOrder & 0xFFFF) + (b.highOrder & 0xFFFF) +
            (c.highOrder & 0xFFFF) + (d.highOrder & 0xFFFF) +
            (e.highOrder & 0xFFFF) + (msw >>> 16);
        msw = (a.highOrder >>> 16) + (b.highOrder >>> 16) +
            (c.highOrder >>> 16) + (d.highOrder >>> 16) +
            (e.highOrder >>> 16) + (lsw >>> 16);
        highOrder = ((msw & 0xFFFF) << 16) | (lsw & 0xFFFF);

        return new Int_64(highOrder, lowOrder);
    },

    /*
     * Calculates the SHA-1 hash of the string set at instantiation
     *
     * @private
     * @param {Array} message The binary array representation of the string to
     *   hash
     * @param {Number} messageLen The number of bits in the message
     * @return The array of integers representing the SHA-1 hash of message
     */
    coreSHA1 = function (message, messageLen)
    {
        var W = [], a, b, c, d, e, T, ch = ch_32, parity = parity_32,
            maj = maj_32, rotl = rotl_32, safeAdd_2 = safeAdd_32_2, i, t,
            safeAdd_5 = safeAdd_32_5, appendedMessageLength,
            H = [
                0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0
            ],
            K = [
                0x5a827999, 0x5a827999, 0x5a827999, 0x5a827999,
                0x5a827999, 0x5a827999, 0x5a827999, 0x5a827999,
                0x5a827999, 0x5a827999, 0x5a827999, 0x5a827999,
                0x5a827999, 0x5a827999, 0x5a827999, 0x5a827999,
                0x5a827999, 0x5a827999, 0x5a827999, 0x5a827999,
                0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1,
                0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1,
                0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1,
                0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1,
                0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1, 0x6ed9eba1,
                0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc,
                0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc,
                0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc,
                0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc,
                0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc, 0x8f1bbcdc,
                0xca62c1d6, 0xca62c1d6, 0xca62c1d6, 0xca62c1d6,
                0xca62c1d6, 0xca62c1d6, 0xca62c1d6, 0xca62c1d6,
                0xca62c1d6, 0xca62c1d6, 0xca62c1d6, 0xca62c1d6,
                0xca62c1d6, 0xca62c1d6, 0xca62c1d6, 0xca62c1d6,
                0xca62c1d6, 0xca62c1d6, 0xca62c1d6, 0xca62c1d6
            ];

        /* Append '1' at the end of the binary string */
        message[messageLen >> 5] |= 0x80 << (24 - (messageLen % 32));
        /* Append length of binary string in the position such that the new
        length is a multiple of 512.  Logic does not work for even multiples
        of 512 but there can never be even multiples of 512 */
        message[(((messageLen + 65) >> 9) << 4) + 15] = messageLen;

        appendedMessageLength = message.length;

        for (i = 0; i < appendedMessageLength; i += 16)
        {
            a = H[0];
            b = H[1];
            c = H[2];
            d = H[3];
            e = H[4];

            for (t = 0; t < 80; t += 1)
            {
                if (t < 16)
                {
                    W[t] = message[t + i];
                }
                else
                {
                    W[t] = rotl(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1);
                }

                if (t < 20)
                {
                    T = safeAdd_5(rotl(a, 5), ch(b, c, d), e, K[t], W[t]);
                }
                else if (t < 40)
                {
                    T = safeAdd_5(rotl(a, 5), parity(b, c, d), e, K[t], W[t]);
                }
                else if (t < 60)
                {
                    T = safeAdd_5(rotl(a, 5), maj(b, c, d), e, K[t], W[t]);
                } else {
                    T = safeAdd_5(rotl(a, 5), parity(b, c, d), e, K[t], W[t]);
                }

                e = d;
                d = c;
                c = rotl(b, 30);
                b = a;
                a = T;
            }

            H[0] = safeAdd_2(a, H[0]);
            H[1] = safeAdd_2(b, H[1]);
            H[2] = safeAdd_2(c, H[2]);
            H[3] = safeAdd_2(d, H[3]);
            H[4] = safeAdd_2(e, H[4]);
        }

        return H;
    },

    /*
     * Calculates the desired SHA-2 hash of the string set at instantiation
     *
     * @private
     * @param {Array} The binary array representation of the string to hash
     * @param {Number} The number of bits in message
     * @param {String} variant The desired SHA-2 variant
     * @return The array of integers representing the SHA-2 hash of message
     */
    coreSHA2 = function (message, messageLen, variant)
    {
        var a, b, c, d, e, f, g, h, T1, T2, H, numRounds, lengthPosition, i, t,
            binaryStringInc, binaryStringMult, safeAdd_2, safeAdd_4, safeAdd_5,
            gamma0, gamma1, sigma0, sigma1, ch, maj, Int, K, W = [],
            appendedMessageLength;

        /* Set up the various function handles and variable for the specific
         * variant */
        if (variant === "SHA-224" || variant === "SHA-256")
        {
            /* 32-bit variant */
            numRounds = 64;
            lengthPosition = (((messageLen + 65) >> 9) << 4) + 15;
            binaryStringInc = 16;
            binaryStringMult = 1;
            Int = Number;
            safeAdd_2 = safeAdd_32_2;
            safeAdd_4 = safeAdd_32_4;
            safeAdd_5 = safeAdd_32_5;
            gamma0 = gamma0_32;
            gamma1 = gamma1_32;
            sigma0 = sigma0_32;
            sigma1 = sigma1_32;
            maj = maj_32;
            ch = ch_32;
            K = [
                    0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5,
                    0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
                    0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3,
                    0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
                    0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC,
                    0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
                    0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7,
                    0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
                    0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
                    0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
                    0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3,
                    0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
                    0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5,
                    0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
                    0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208,
                    0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
                ];

            if (variant === "SHA-224")
            {
                H = [
                        0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,
                        0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4
                    ];
            }
            else
            {
                H = [
                        0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
                        0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19
                    ];
            }
        }
        else if (variant === "SHA-384" || variant === "SHA-512")
        {
            /* 64-bit variant */
            numRounds = 80;
            lengthPosition = (((messageLen + 128) >> 10) << 5) + 31;
            binaryStringInc = 32;
            binaryStringMult = 2;
            Int = Int_64;
            safeAdd_2 = safeAdd_64_2;
            safeAdd_4 = safeAdd_64_4;
            safeAdd_5 = safeAdd_64_5;
            gamma0 = gamma0_64;
            gamma1 = gamma1_64;
            sigma0 = sigma0_64;
            sigma1 = sigma1_64;
            maj = maj_64;
            ch = ch_64;

            K = [
                new Int(0x428a2f98, 0xd728ae22), new Int(0x71374491, 0x23ef65cd),
                new Int(0xb5c0fbcf, 0xec4d3b2f), new Int(0xe9b5dba5, 0x8189dbbc),
                new Int(0x3956c25b, 0xf348b538), new Int(0x59f111f1, 0xb605d019),
                new Int(0x923f82a4, 0xaf194f9b), new Int(0xab1c5ed5, 0xda6d8118),
                new Int(0xd807aa98, 0xa3030242), new Int(0x12835b01, 0x45706fbe),
                new Int(0x243185be, 0x4ee4b28c), new Int(0x550c7dc3, 0xd5ffb4e2),
                new Int(0x72be5d74, 0xf27b896f), new Int(0x80deb1fe, 0x3b1696b1),
                new Int(0x9bdc06a7, 0x25c71235), new Int(0xc19bf174, 0xcf692694),
                new Int(0xe49b69c1, 0x9ef14ad2), new Int(0xefbe4786, 0x384f25e3),
                new Int(0x0fc19dc6, 0x8b8cd5b5), new Int(0x240ca1cc, 0x77ac9c65),
                new Int(0x2de92c6f, 0x592b0275), new Int(0x4a7484aa, 0x6ea6e483),
                new Int(0x5cb0a9dc, 0xbd41fbd4), new Int(0x76f988da, 0x831153b5),
                new Int(0x983e5152, 0xee66dfab), new Int(0xa831c66d, 0x2db43210),
                new Int(0xb00327c8, 0x98fb213f), new Int(0xbf597fc7, 0xbeef0ee4),
                new Int(0xc6e00bf3, 0x3da88fc2), new Int(0xd5a79147, 0x930aa725),
                new Int(0x06ca6351, 0xe003826f), new Int(0x14292967, 0x0a0e6e70),
                new Int(0x27b70a85, 0x46d22ffc), new Int(0x2e1b2138, 0x5c26c926),
                new Int(0x4d2c6dfc, 0x5ac42aed), new Int(0x53380d13, 0x9d95b3df),
                new Int(0x650a7354, 0x8baf63de), new Int(0x766a0abb, 0x3c77b2a8),
                new Int(0x81c2c92e, 0x47edaee6), new Int(0x92722c85, 0x1482353b),
                new Int(0xa2bfe8a1, 0x4cf10364), new Int(0xa81a664b, 0xbc423001),
                new Int(0xc24b8b70, 0xd0f89791), new Int(0xc76c51a3, 0x0654be30),
                new Int(0xd192e819, 0xd6ef5218), new Int(0xd6990624, 0x5565a910),
                new Int(0xf40e3585, 0x5771202a), new Int(0x106aa070, 0x32bbd1b8),
                new Int(0x19a4c116, 0xb8d2d0c8), new Int(0x1e376c08, 0x5141ab53),
                new Int(0x2748774c, 0xdf8eeb99), new Int(0x34b0bcb5, 0xe19b48a8),
                new Int(0x391c0cb3, 0xc5c95a63), new Int(0x4ed8aa4a, 0xe3418acb),
                new Int(0x5b9cca4f, 0x7763e373), new Int(0x682e6ff3, 0xd6b2b8a3),
                new Int(0x748f82ee, 0x5defb2fc), new Int(0x78a5636f, 0x43172f60),
                new Int(0x84c87814, 0xa1f0ab72), new Int(0x8cc70208, 0x1a6439ec),
                new Int(0x90befffa, 0x23631e28), new Int(0xa4506ceb, 0xde82bde9),
                new Int(0xbef9a3f7, 0xb2c67915), new Int(0xc67178f2, 0xe372532b),
                new Int(0xca273ece, 0xea26619c), new Int(0xd186b8c7, 0x21c0c207),
                new Int(0xeada7dd6, 0xcde0eb1e), new Int(0xf57d4f7f, 0xee6ed178),
                new Int(0x06f067aa, 0x72176fba), new Int(0x0a637dc5, 0xa2c898a6),
                new Int(0x113f9804, 0xbef90dae), new Int(0x1b710b35, 0x131c471b),
                new Int(0x28db77f5, 0x23047d84), new Int(0x32caab7b, 0x40c72493),
                new Int(0x3c9ebe0a, 0x15c9bebc), new Int(0x431d67c4, 0x9c100d4c),
                new Int(0x4cc5d4be, 0xcb3e42b6), new Int(0x597f299c, 0xfc657e2a),
                new Int(0x5fcb6fab, 0x3ad6faec), new Int(0x6c44198c, 0x4a475817)
            ];

            if (variant === "SHA-384")
            {
                H = [
                    new Int(0xcbbb9d5d, 0xc1059ed8), new Int(0x0629a292a, 0x367cd507),
                    new Int(0x9159015a, 0x3070dd17), new Int(0x0152fecd8, 0xf70e5939),
                    new Int(0x67332667, 0xffc00b31), new Int(0x98eb44a87, 0x68581511),
                    new Int(0xdb0c2e0d, 0x64f98fa7), new Int(0x047b5481d, 0xbefa4fa4)
                ];
            }
            else
            {
                H = [
                    new Int(0x6a09e667, 0xf3bcc908), new Int(0xbb67ae85, 0x84caa73b),
                    new Int(0x3c6ef372, 0xfe94f82b), new Int(0xa54ff53a, 0x5f1d36f1),
                    new Int(0x510e527f, 0xade682d1), new Int(0x9b05688c, 0x2b3e6c1f),
                    new Int(0x1f83d9ab, 0xfb41bd6b), new Int(0x5be0cd19, 0x137e2179)
                ];
            }
        }

        /* Append '1' at the end of the binary string */
        message[messageLen >> 5] |= 0x80 << (24 - messageLen % 32);
        /* Append length of binary string in the position such that the new
         * length is correct */
        message[lengthPosition] = messageLen;

        appendedMessageLength = message.length;

        for (i = 0; i < appendedMessageLength; i += binaryStringInc)
        {
            a = H[0];
            b = H[1];
            c = H[2];
            d = H[3];
            e = H[4];
            f = H[5];
            g = H[6];
            h = H[7];

            for (t = 0; t < numRounds; t += 1)
            {
                if (t < 16)
                {
                    /* Bit of a hack - for 32-bit, the second term is ignored */
                    W[t] = new Int(message[t * binaryStringMult + i],
                            message[t * binaryStringMult + i + 1]);
                }
                else
                {
                    W[t] = safeAdd_4(
                            gamma1(W[t - 2]), W[t - 7],
                            gamma0(W[t - 15]), W[t - 16]
                        );
                }

                T1 = safeAdd_5(h, sigma1(e), ch(e, f, g), K[t], W[t]);
                T2 = safeAdd_2(sigma0(a), maj(a, b, c));
                h = g;
                g = f;
                f = e;
                e = safeAdd_2(d, T1);
                d = c;
                c = b;
                b = a;
                a = safeAdd_2(T1, T2);
            }

            H[0] = safeAdd_2(a, H[0]);
            H[1] = safeAdd_2(b, H[1]);
            H[2] = safeAdd_2(c, H[2]);
            H[3] = safeAdd_2(d, H[3]);
            H[4] = safeAdd_2(e, H[4]);
            H[5] = safeAdd_2(f, H[5]);
            H[6] = safeAdd_2(g, H[6]);
            H[7] = safeAdd_2(h, H[7]);
        }

        switch (variant)
        {
        case "SHA-224":
            return  [
                H[0], H[1], H[2], H[3],
                H[4], H[5], H[6]
            ];
        case "SHA-256":
            return H;
        case "SHA-384":
            return [
                H[0].highOrder, H[0].lowOrder,
                H[1].highOrder, H[1].lowOrder,
                H[2].highOrder, H[2].lowOrder,
                H[3].highOrder, H[3].lowOrder,
                H[4].highOrder, H[4].lowOrder,
                H[5].highOrder, H[5].lowOrder
            ];
        case "SHA-512":
            return [
                H[0].highOrder, H[0].lowOrder,
                H[1].highOrder, H[1].lowOrder,
                H[2].highOrder, H[2].lowOrder,
                H[3].highOrder, H[3].lowOrder,
                H[4].highOrder, H[4].lowOrder,
                H[5].highOrder, H[5].lowOrder,
                H[6].highOrder, H[6].lowOrder,
                H[7].highOrder, H[7].lowOrder
            ];
        default:
            /* This should never be reached */
            return [];
        }
    },

    /*
     * jsSHA is the workhorse of the library.  Instantiate it with the string to
     * be hashed as the parameter
     *
     * @constructor
     * @param {String} srcString The string to be hashed
     * @param {String} inputFormat The format of srcString, ASCII or HEX
     */
    jsSHA = function (srcString, inputFormat)
    {

        this.sha1 = null;
        this.sha224 = null;
        this.sha256 = null;
        this.sha384 = null;
        this.sha512 = null;

        this.strBinLen = null;
        this.strToHash = null;

        /* Convert the input string into the correct type */
        if ("HEX" === inputFormat)
        {
            if (0 !== (srcString.length % 2))
            {
                return "TEXT MUST BE IN BYTE INCREMENTS";
            }
            this.strBinLen = srcString.length * 4;
            this.strToHash = hex2binb(srcString);
        }
        else if (("ASCII" === inputFormat) ||
             ('undefined' === typeof(inputFormat)))
        {
            this.strBinLen = srcString.length * charSize;
            this.strToHash = str2binb(srcString);
        }
        else
        {
            return "UNKNOWN TEXT INPUT TYPE";
        }
    };

    jsSHA.prototype = {
        /*
         * Returns the desired SHA hash of the string specified at instantiation
         * using the specified parameters
         *
         * @param {String} variant The desired SHA variant (SHA-1, SHA-224,
         *   SHA-256, SHA-384, or SHA-512)
         * @param {String} format The desired output formatting (B64 or HEX)
         * @return The string representation of the hash in the format specified
         */
        getHash : function (variant, format)
        {
            var formatFunc = null, message = this.strToHash.slice();

            switch (format)
            {
            case "HEX":
                formatFunc = binb2hex;
                break;
            case "B64":
                formatFunc = binb2b64;
                break;
            default:
                return "FORMAT NOT RECOGNIZED";
            }

            switch (variant)
            {
            case "SHA-1":
                if (null === this.sha1)
                {
                    this.sha1 = coreSHA1(message, this.strBinLen);
                }
                return formatFunc(this.sha1);
            case "SHA-224":
                if (null === this.sha224)
                {
                    this.sha224 = coreSHA2(message, this.strBinLen, variant);
                }
                return formatFunc(this.sha224);
            case "SHA-256":
                if (null === this.sha256)
                {
                    this.sha256 = coreSHA2(message, this.strBinLen, variant);
                }
                return formatFunc(this.sha256);
            case "SHA-384":
                if (null === this.sha384)
                {
                    this.sha384 = coreSHA2(message, this.strBinLen, variant);
                }
                return formatFunc(this.sha384);
            case "SHA-512":
                if (null === this.sha512)
                {
                    this.sha512 = coreSHA2(message, this.strBinLen, variant);
                }
                return formatFunc(this.sha512);
            default:
                return "HASH NOT RECOGNIZED";
            }
        },

        /*
         * Returns the desired HMAC of the string specified at instantiation
         * using the key and variant param.
         *
         * @param {String} key The key used to calculate the HMAC
         * @param {String} inputFormat The format of key, ASCII or HEX
         * @param {String} variant The desired SHA variant (SHA-1, SHA-224,
         *   SHA-256, SHA-384, or SHA-512)
         * @param {String} outputFormat The desired output formatting
         *   (B64 or HEX)
         * @return The string representation of the hash in the format specified
         */
        getHMAC : function (key, inputFormat, variant, outputFormat)
        {
            var formatFunc, keyToUse, blockByteSize, blockBitSize, i,
                retVal, lastArrayIndex, keyBinLen, hashBitSize,
                keyWithIPad = [], keyWithOPad = [];

            /* Validate the output format selection */
            switch (outputFormat)
            {
            case "HEX":
                formatFunc = binb2hex;
                break;
            case "B64":
                formatFunc = binb2b64;
                break;
            default:
                return "FORMAT NOT RECOGNIZED";
            }

            /* Validate the hash variant selection and set needed variables */
            switch (variant)
            {
            case "SHA-1":
                blockByteSize = 64;
                hashBitSize = 160;
                break;
            case "SHA-224":
                blockByteSize = 64;
                hashBitSize = 224;
                break;
            case "SHA-256":
                blockByteSize = 64;
                hashBitSize = 256;
                break;
            case "SHA-384":
                blockByteSize = 128;
                hashBitSize = 384;
                break;
            case "SHA-512":
                blockByteSize = 128;
                hashBitSize = 512;
                break;
            default:
                return "HASH NOT RECOGNIZED";
            }

            /* Validate input format selection */
            if ("HEX" === inputFormat)
            {
                /* Nibbles must come in pairs */
                if (0 !== (key.length % 2))
                {
                    return "KEY MUST BE IN BYTE INCREMENTS";
                }
                keyToUse = hex2binb(key);
                keyBinLen = key.length * 4;
            }
            else if ("ASCII" === inputFormat)
            {
                keyToUse = str2binb(key);
                keyBinLen = key.length * charSize;
            }
            else
            {
                return "UNKNOWN KEY INPUT TYPE";
            }

            /* These are used multiple times, calculate and store them */
            blockBitSize = blockByteSize * 8;
            lastArrayIndex = (blockByteSize / 4) - 1;

            /* Figure out what to do with the key based on its size relative to
             * the hash's block size */
            if (blockByteSize < (keyBinLen / 8))
            {
                if ("SHA-1" === variant)
                {
                    keyToUse = coreSHA1(keyToUse, keyBinLen);
                }
                else
                {
                    keyToUse = coreSHA2(keyToUse, keyBinLen, variant);
                }
                /* For all variants, the block size is bigger than the output
                 * size so there will never be a useful byte at the end of the
                 * string */
                keyToUse[lastArrayIndex] &= 0xFFFFFF00;
            }
            else if (blockByteSize > (keyBinLen / 8))
            {
                /* If the blockByteSize is greater than the key length, there
                 * will always be at LEAST one "useless" byte at the end of the
                 * string */
                keyToUse[lastArrayIndex] &= 0xFFFFFF00;
            }

            /* Create ipad and opad */
            for (i = 0; i <= lastArrayIndex; i += 1)
            {
                keyWithIPad[i] = keyToUse[i] ^ 0x36363636;
                keyWithOPad[i] = keyToUse[i] ^ 0x5C5C5C5C;
            }

            /* Calculate the HMAC */
            if ("SHA-1" === variant)
            {
                retVal = coreSHA1(
                            keyWithIPad.concat(this.strToHash),
                            blockBitSize + this.strBinLen);
                retVal = coreSHA1(
                            keyWithOPad.concat(retVal),
                            blockBitSize + hashBitSize);
            }
            else
            {
                retVal = coreSHA2(
                            keyWithIPad.concat(this.strToHash),
                            blockBitSize + this.strBinLen, variant);
                retVal = coreSHA2(
                            keyWithOPad.concat(retVal),
                            blockBitSize + hashBitSize, variant);
            }

            return (formatFunc(retVal));
        }
    };

    JS_SHA = jsSHA;
}());



//-----------------------------------------------------------------------------

/*
    http://www.JSON.org/json2.js
    2011-10-19

    Public Domain.

    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

    See http://www.JSON.org/js.html


    This code should be minified before deployment.
    See http://javascript.crockford.com/jsmin.html

    USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
    NOT CONTROL.


    This file creates a global JSON object containing two methods: stringify
    and parse.

        JSON.stringify(value, replacer, space)
            value       any JavaScript value, usually an object or array.

            replacer    an optional parameter that determines how object
                        values are stringified for objects. It can be a
                        function or an array of strings.

            space       an optional parameter that specifies the indentation
                        of nested structures. If it is omitted, the text will
                        be packed without extra whitespace. If it is a number,
                        it will specify the number of spaces to indent at each
                        level. If it is a string (such as '\t' or '&nbsp;'),
                        it contains the characters used to indent at each level.

            This method produces a JSON text from a JavaScript value.

            When an object value is found, if the object contains a toJSON
            method, its toJSON method will be called and the result will be
            stringified. A toJSON method does not serialize: it returns the
            value represented by the name/value pair that should be serialized,
            or undefined if nothing should be serialized. The toJSON method
            will be passed the key associated with the value, and this will be
            bound to the value

            For example, this would serialize Dates as ISO strings.

                Date.prototype.toJSON = function (key) {
                    function f(n) {
                        // Format integers to have at least two digits.
                        return n < 10 ? '0' + n : n;
                    }

                    return this.getUTCFullYear()   + '-' +
                         f(this.getUTCMonth() + 1) + '-' +
                         f(this.getUTCDate())      + 'T' +
                         f(this.getUTCHours())     + ':' +
                         f(this.getUTCMinutes())   + ':' +
                         f(this.getUTCSeconds())   + 'Z';
                };

            You can provide an optional replacer method. It will be passed the
            key and value of each member, with this bound to the containing
            object. The value that is returned from your method will be
            serialized. If your method returns undefined, then the member will
            be excluded from the serialization.

            If the replacer parameter is an array of strings, then it will be
            used to select the members to be serialized. It filters the results
            such that only members with keys listed in the replacer array are
            stringified.

            Values that do not have JSON representations, such as undefined or
            functions, will not be serialized. Such values in objects will be
            dropped; in arrays they will be replaced with null. You can use
            a replacer function to replace those with JSON values.
            JSON.stringify(undefined) returns undefined.

            The optional space parameter produces a stringification of the
            value that is filled with line breaks and indentation to make it
            easier to read.

            If the space parameter is a non-empty string, then that string will
            be used for indentation. If the space parameter is a number, then
            the indentation will be that many spaces.

            Example:

            text = JSON.stringify(['e', {pluribus: 'unum'}]);
            // text is '["e",{"pluribus":"unum"}]'


            text = JSON.stringify(['e', {pluribus: 'unum'}], null, '\t');
            // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

            text = JSON.stringify([new Date()], function (key, value) {
                return this[key] instanceof Date ?
                    'Date(' + this[key] + ')' : value;
            });
            // text is '["Date(---current time---)"]'


        JSON.parse(text, reviver)
            This method parses a JSON text to produce an object or array.
            It can throw a SyntaxError exception.

            The optional reviver parameter is a function that can filter and
            transform the results. It receives each of the keys and values,
            and its return value is used instead of the original value.
            If it returns what it received, then the structure is not modified.
            If it returns undefined then the member is deleted.

            Example:

            // Parse the text. Values that look like ISO date strings will
            // be converted to Date objects.

            myData = JSON.parse(text, function (key, value) {
                var a;
                if (typeof value === 'string') {
                    a =
/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
                    if (a) {
                        return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
                            +a[5], +a[6]));
                    }
                }
                return value;
            });

            myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
                var d;
                if (typeof value === 'string' &&
                        value.slice(0, 5) === 'Date(' &&
                        value.slice(-1) === ')') {
                    d = new Date(value.slice(5, -1));
                    if (d) {
                        return d;
                    }
                }
                return value;
            });


    This is a reference implementation. You are free to copy, modify, or
    redistribute.
*/

/*jslint evil: true, regexp: true */

/*members "", "\b", "\t", "\n", "\f", "\r", "\"", JSON, "\\", apply,
    call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
    getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
    lastIndex, length, parse, prototype, push, replace, slice, stringify,
    test, toJSON, toString, valueOf
*/


// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

var JSON;
if (!JSON) {
    JSON = {};
}

(function () {
    'use strict';

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function (key) {

            return isFinite(this.valueOf())
                ? this.getUTCFullYear()     + '-' +
                    f(this.getUTCMonth() + 1) + '-' +
                    f(this.getUTCDate())      + 'T' +
                    f(this.getUTCHours())     + ':' +
                    f(this.getUTCMinutes())   + ':' +
                    f(this.getUTCSeconds())   + 'Z'
                : null;
        };

        String.prototype.toJSON      =
            Number.prototype.toJSON  =
            Boolean.prototype.toJSON = function (key) {
                return this.valueOf();
            };
    }

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string'
                ? c
                : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' &&
                typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case 'string':
            return quote(value);

        case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value) ? String(value) : 'null';

        case 'boolean':
        case 'null':

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce 'null'. The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is 'object', we might be dealing with an object or an array or
// null.

        case 'object':

// Due to a specification blunder in ECMAScript, typeof null is 'object',
// so watch out for that case.

            if (!value) {
                return 'null';
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0
                    ? '[]'
                    : gap
                    ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']'
                    : '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    if (typeof rep[i] === 'string') {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0
                ? '{}'
                : gap
                ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}'
                : '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === 'string') {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' &&
                    (typeof replacer !== 'object' ||
                    typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

// Make a fake root object containing our value under the key of ''.
// Return the result of stringifying the value.

            return str('', {'': value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/
                    .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                        .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                        .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function'
                    ? walk({'': j}, '')
                    : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
}());

