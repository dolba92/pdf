    const $=s=>document.querySelector(s);
    const $$=s=>document.querySelectorAll(s);

    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const App={
        pdfDoc:null,
        currentPage:1,
        totalPages:0,
        zoom:1,
        zoomMode:'fit-width',
        rotation:0,
        fileName:'',
        fileId:'',
        fileData:null,
        annotations:[],
        bookmarks:[],
        notes:[],
        history:[],
        historyIndex:-1,
        editMode:false,
        currentTool:'highlight',
        editColor:'#FFEB3B',
        editSize:2,
        selectedAnnotation:null,
        currentSearch:'',
        searchResults:[],
        searchIndex:-1,
        viewMode:'single',
        continuousRenderedPages:1,
        touchStartDist:0,
        touchStartZoom:1,
        lastSavedPage:0,

        _resizeTimer:null,
        _zoomTimer:null,

        init(){
            this._zoomDisplay=$('#zoomValue');
            this.bindEvents();
            this.setupDragDrop();
            this.restoreLastSession();
        },

        async restoreLastSession(){
            try{
                const lastId=localStorage.getItem('lastOpenedFileId');
                if(!lastId)return;
                const docs=this.getRecentDocs();
                const doc=docs.find(d=>d.id===lastId);
                if(!doc)return;
                await this.openRecentDoc(doc.id,doc.name,true);
            }catch(e){console.log('Restore error',e);localStorage.removeItem('lastOpenedFileId');}
        },

        genId(str){let h=0;for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return'h'+Math.abs(h).toString(36);},

        bindEvents(){
            const self=this;

            const fileInput=$('#fileInput');
            fileInput.addEventListener('change',e=>{
                if(e.target.files[0])self.loadPDF(e.target.files[0]);
                e.target.value='';
            });

            $('#btnBackToHome').addEventListener('click',()=>self.goHome());
            $('#btnPrevPage').addEventListener('click',()=>self.goToPage(self.currentPage-1));
            $('#btnNextPage').addEventListener('click',()=>self.goToPage(self.currentPage+1));
            $('#pageInput').addEventListener('change',e=>self.goToPage(parseInt(e.target.value)||1));

            $('#btnZoomIn').addEventListener('click',()=>self.setZoom(self.zoom*1.25));
            $('#btnZoomOut').addEventListener('click',()=>self.setZoom(self.zoom/1.25));
            $('#zoomSelect').addEventListener('change',e=>{
                const v=e.target.value;
                if(v==='fit-width'||v==='fit-page'){self.zoomMode=v;self.fitPage();}
                else self.setZoom(parseInt(v)/100);
            });

            $('#btnViewSingle').addEventListener('click',()=>self.setViewMode('single'));
            $('#btnViewDouble').addEventListener('click',()=>self.setViewMode('double'));
            $('#btnViewContinuous').addEventListener('click',()=>self.setViewMode('continuous'));

            $('#btnSidebar').addEventListener('click',()=>self.toggleSidebar());
            $('#btnSearch').addEventListener('click',()=>self.toggleSearch());
            $('#btnEditToggle').addEventListener('click',()=>self.toggleEditMode());
            $('#btnRotate').addEventListener('click',()=>self.rotatePage());
            $('#btnFullscreen').addEventListener('click',()=>self.toggleFullscreen());
            $('#btnMenu').addEventListener('click',e=>{e.stopPropagation();$('#dropdownMenu').classList.toggle('show');});
            document.addEventListener('click',()=>$('#dropdownMenu').classList.remove('show'));

            $('#btnPrint').addEventListener('click',()=>self.printPDF());
            $('#btnDownload').addEventListener('click',()=>self.downloadPDF());
            $('#btnSaveCopy').addEventListener('click',()=>self.saveCopy());
            $('#btnBookmarks').addEventListener('click',()=>self.addBookmark());
            $('#btnNotes').addEventListener('click',()=>self.addNote());
            $('#btnShowOutline').addEventListener('click',()=>self.toggleOutline());

            $('#btnSearchPrev').addEventListener('click',()=>self.searchPrev());
            $('#btnSearchNext').addEventListener('click',()=>self.searchNext());
            $('#btnSearchClose').addEventListener('click',()=>self.toggleSearch());
            $('#searchInput').addEventListener('input',e=>self.doSearch(e.target.value));
            $('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.shiftKey?self.searchPrev():self.searchNext();}});

            $$('.edit-tool-btn[data-tool]').forEach(btn=>{
                btn.addEventListener('click',()=>{
                    $$('.edit-tool-btn[data-tool]').forEach(b=>b.classList.remove('active'));
                    btn.classList.add('active');
                    self.currentTool=btn.dataset.tool;
                });
            });
            $('#editColor').addEventListener('input',e=>self.editColor=e.target.value);
            $('#editSize').addEventListener('input',e=>self.editSize=parseInt(e.target.value));
            $('#btnUndo').addEventListener('click',()=>self.undo());
            $('#btnRedo').addEventListener('click',()=>self.redo());
            $('#btnDeleteAnnotation').addEventListener('click',()=>self.deleteSelected());

            $$('.sidebar-tab').forEach(tab=>{
                tab.addEventListener('click',()=>{
                    $$('.sidebar-tab').forEach(t=>t.classList.remove('active'));
                    tab.classList.add('active');
                    $$('.sidebar-panel').forEach(p=>p.classList.remove('active'));
                    const panelId='panel'+tab.dataset.tab.charAt(0).toUpperCase()+tab.dataset.tab.slice(1);
                    const panel=$('#'+panelId);
                    if(panel)panel.classList.add('active');
                });
            });

            $('#btnAddBookmark').addEventListener('click',()=>self.addBookmark());
            $('#btnAddNote').addEventListener('click',()=>self.addNote());

            $('#closeNoteModal').addEventListener('click',()=>$('#noteModal').style.display='none');
            $('#cancelNote').addEventListener('click',()=>$('#noteModal').style.display='none');
            $('#saveNote').addEventListener('click',()=>self.saveNote());
            $('#closeBookmarkModal').addEventListener('click',()=>$('#bookmarkModal').style.display='none');
            $('#cancelBookmark').addEventListener('click',()=>$('#bookmarkModal').style.display='none');
            $('#saveBookmark').addEventListener('click',()=>self.saveBookmark());
            $('#continueFromStart').addEventListener('click',()=>{$('#continueModal').style.display='none';});
            $('#continueFromLast').addEventListener('click',()=>{self.goToPage(self.lastSavedPage);$('#continueModal').style.display='none';});
            $('#closeTextModal').addEventListener('click',()=>$('#textModal').style.display='none');
            $('#cancelText').addEventListener('click',()=>$('#textModal').style.display='none');
            $('#saveText').addEventListener('click',()=>self.saveTextAnnotation());

            $('#barClose').addEventListener('click',()=>self.goHome());
            $('#barPrev').addEventListener('click',()=>self.goToPage(self.currentPage-1));
            $('#barNext').addEventListener('click',()=>self.goToPage(self.currentPage+1));
            $('#barPageInput').addEventListener('change',e=>self.goToPage(parseInt(e.target.value)||1));
            $('#barZoomIn').addEventListener('click',()=>self.setZoom(self.zoom*1.25));
            $('#barZoomOut').addEventListener('click',()=>self.setZoom(self.zoom/1.25));

            $('#sidebarOverlay').addEventListener('click',()=>self.toggleSidebar());

            document.addEventListener('keydown',e=>{
                if(e.ctrlKey||e.metaKey){
                    if(e.key==='z'){e.preventDefault();self.undo();}
                    else if(e.key==='y'){e.preventDefault();self.redo();}
                    else if(e.key==='s'){e.preventDefault();self.saveCopy();}
                    else if(e.key==='f'){e.preventDefault();self.toggleSearch();}
                }
                if(e.key==='F11'){e.preventDefault();self.toggleFullscreen();}
                if(e.key==='ArrowLeft'&&!e.target.matches('input,textarea'))self.goToPage(self.currentPage-1);
                if(e.key==='ArrowRight'&&!e.target.matches('input,textarea'))self.goToPage(self.currentPage+1);
                if(e.key==='PageUp'&&!e.target.matches('input,textarea'))self.goToPage(self.currentPage-10);
                if(e.key==='PageDown'&&!e.target.matches('input,textarea'))self.goToPage(self.currentPage+10);
                if(e.key==='Home'&&!e.target.matches('input,textarea'))self.goToPage(1);
                if(e.key==='End'&&!e.target.matches('input,textarea'))self.goToPage(self.totalPages);
            });

            const viewer=$('#pdfViewer');
            viewer.addEventListener('wheel',e=>{
                if(e.ctrlKey||e.metaKey){
                    e.preventDefault();
                    clearTimeout(self._zoomTimer);
                    const newZoom=self.zoom*(e.deltaY<0?1.1:0.9);
                    self._zoomTimer=setTimeout(()=>self.setZoom(newZoom),50);
                }
            },{passive:false});

            this.setupTouchEvents(viewer);

            $('#annotationsLayer').addEventListener('click',e=>{
                if(!self.editMode)return;
                const el=e.target.closest('.annotation');
                if(el){
                    $$('.annotation.selected').forEach(a=>a.classList.remove('selected'));
                    el.classList.add('selected');
                    self.selectedAnnotation=el.dataset.id;
                }else{
                    $$('.annotation.selected').forEach(a=>a.classList.remove('selected'));
                    self.selectedAnnotation=null;
                    if(['highlight','underline','strikethrough'].includes(self.currentTool)){
                        self.startTextSelection(e);
                    }else if(['text','line','rect'].includes(self.currentTool)){
                        self.addShapeAnnotation(e);
                    }
                }
            });

            window.addEventListener('resize',()=>{if(self.pdfDoc){clearTimeout(self._resizeTimer);self._resizeTimer=setTimeout(()=>self.renderPage(self.currentPage),150);}});
        },

        setupTouchEvents(el){
            const self=this;
            let startX,startY,swiping=false;
            let pinchZooming=false;
            let pinchScale=1;
            const container=$('#pdfCanvasContainer');

            el.addEventListener('touchstart',e=>{
                if(e.touches.length===2){
                    pinchZooming=true;
                    swiping=false;
                    const dx=e.touches[0].clientX-e.touches[1].clientX;
                    const dy=e.touches[0].clientY-e.touches[1].clientY;
                    self.touchStartDist=Math.sqrt(dx*dx+dy*dy);
                    self.touchStartZoom=self.zoom;
                    pinchScale=1;
                    container.style.transition='none';
                }else if(e.touches.length===1){
                    startX=e.touches[0].clientX;
                    startY=e.touches[0].clientY;
                    swiping=true;
                }
            },{passive:true});

            el.addEventListener('touchmove',e=>{
                if(e.touches.length===2&&pinchZooming){
                    e.preventDefault();
                    const dx=e.touches[0].clientX-e.touches[1].clientX;
                    const dy=e.touches[0].clientY-e.touches[1].clientY;
                    const dist=Math.sqrt(dx*dx+dy*dy);
                    pinchScale=dist/self.touchStartDist;
                    const previewZoom=self.touchStartZoom*pinchScale;
                    container.style.transform='scale('+pinchScale+')';
                    container.style.transformOrigin='center center';
                    self._zoomDisplay.textContent=Math.round(previewZoom*100)+'%';
                    document.getElementById('barZoomValue').textContent=Math.round(previewZoom*100)+'%';
                }
            },{passive:false});

            el.addEventListener('touchend',e=>{
                if(pinchZooming&&e.touches.length<2){
                    pinchZooming=false;
                    container.style.transition='';
                    container.style.transform='';
                    const finalZoom=Math.max(0.25,Math.min(5,self.touchStartZoom*pinchScale));
                    self.setZoom(finalZoom);
                }
                if(swiping&&e.changedTouches.length===1&&(e.touches.length===0)){
                    const dx=e.changedTouches[0].clientX-startX;
                    const dy=e.changedTouches[0].clientY-startY;
                    if(Math.abs(dx)>80&&Math.abs(dy)<60){
                        if(dx<0)self.goToPage(self.currentPage+1);
                        else self.goToPage(self.currentPage-1);
                    }
                }
                swiping=false;
            });
        },

        setupDragDrop(){
            const self=this;
            const area=$('#uploadArea');
            ['dragenter','dragover','dragleave','drop'].forEach(ev=>{
                area.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();});
            });
            ['dragenter','dragover'].forEach(ev=>{
                area.addEventListener(ev,()=>area.classList.add('dragover'));
            });
            ['dragleave','drop'].forEach(ev=>{
                area.addEventListener(ev,()=>area.classList.remove('dragover'));
            });
            area.addEventListener('drop',e=>{
                const f=e.dataTransfer.files[0];
                if(f&&f.type==='application/pdf')self.loadPDF(f);
            });
        },

        async loadPDF(file){
            this.fileName=file.name;
            this.fileId=this.genId(file.name+file.size+file.lastModified);

            this.showUI();
            document.getElementById('docTitle').textContent=this.fileName;
            document.getElementById('totalPages').textContent='...';
            document.getElementById('barTotalPages').textContent='...';

            try{
                const buf=await file.arrayBuffer();
                this.fileData=new Uint8Array(buf);
                const fileCopy=new Uint8Array(this.fileData);
                await this.saveFileToDB(this.fileId,fileCopy);
                localStorage.setItem('lastOpenedFileId',this.fileId);
                this.pdfDoc=await pdfjsLib.getDocument({data:this.fileData}).promise;
                this._pageCache={};
            }catch(e){
                alert('Ошибка загрузки PDF: '+e.message);
                this.goHome();
                return;
            }

            this.totalPages=this.pdfDoc.numPages;
            this.currentPage=1;
            this.rotation=0;
            this.annotations=[];
            this.bookmarks=[];
            this.notes=[];
            this.history=[];
            this.historyIndex=-1;

            document.getElementById('totalPages').textContent=this.totalPages;
            document.getElementById('barTotalPages').textContent=this.totalPages;
            this.updateZoomDisplay();

            const saved=this.getSavedData();
            const startPage=(saved&&saved.currentPage>1)?saved.currentPage:1;
            this.goToPage(startPage);

            this.loadData();
            this.loadOutline();
            this.generateThumbnails();
            this.updateRecentDocs();

            if(saved&&saved.currentPage>1&&startPage===saved.currentPage){
                this.lastSavedPage=saved.currentPage;
                document.getElementById('continuePageNum').textContent=saved.currentPage;
                document.getElementById('continueModal').style.display='flex';
            }
        },

        showUI(){
            document.getElementById('homeScreen').style.display='none';
            document.getElementById('readerScreen').style.display='flex';
            document.getElementById('bottomBar').style.display='flex';
            document.getElementById('toolbar').style.display='flex';
        },

        goHome(){
            document.getElementById('homeScreen').style.display='flex';
            document.getElementById('readerScreen').style.display='none';
            document.getElementById('bottomBar').style.display='none';
            this.pdfDoc=null;
            this.editMode=false;
            document.getElementById('editToolbar').style.display='none';
            document.getElementById('searchBar').style.display='none';
            this.updateRecentDocs();
            localStorage.removeItem('lastOpenedFileId');
        },

        toggleSidebar(){
            const sb=$('#sidebar');
            const isMobile=window.innerWidth<=768;
            if(isMobile){
                sb.classList.toggle('open');
            }else{
                sb.style.display=sb.style.display==='none'?'flex':'none';
            }
        },

        toggleSearch(){
            const sb=$('#searchBar');
            sb.style.display=sb.style.display==='none'?'block':'none';
            if(sb.style.display==='block')$('#searchInput').focus();
        },

        toggleOutline(){
            const tab=$$('.sidebar-tab').forEach(t=>t.classList.remove('active'));
            $$('.sidebar-panel').forEach(p=>p.classList.remove('active'));
            $$('.sidebar-tab')[3].classList.add('active');
            const panel=$('#panelOutline');
            if(panel)panel.classList.add('active');
            if($('#sidebar').style.display==='none')this.toggleSidebar();
        },

        toggleEditMode(){
            this.editMode=!this.editMode;
            const tb=$('#editToolbar');
            const btn=$('#btnEditToggle');
            if(this.editMode){
                tb.style.display='flex';
                btn.classList.add('active');
            }else{
                tb.style.display='none';
                btn.classList.remove('active');
            }
        },

        toggleFullscreen(){
            if(!document.fullscreenElement){
                document.documentElement.requestFullscreen().catch(()=>{});
            }else{
                document.exitFullscreen();
            }
        },

        async renderPage(num){
            if(!this.pdfDoc)return;
            if(this._renderTask){try{this._renderTask.cancel();}catch(e){}this._renderTask=null;}
            if(!this._pageCache)this._pageCache={};
            const key=num+'_'+this.zoom+'_'+this.rotation;
            if(this._pageCache[key]){
                const cached=this._pageCache[key];
                const canvas=$('#pdfCanvas');
                canvas.width=cached.width;
                canvas.height=cached.height;
                canvas.getContext('2d').drawImage(cached,0,0);
                const container=$('#pdfCanvasContainer');
                container.style.width=cached.width+'px';
                container.style.height=cached.height+'px';
                this.renderAnnotations();
                return;
            }
            try{
                const page=await this.pdfDoc.getPage(num);
                const vp=page.getViewport({scale:this.zoom,rotation:this.rotation});
                const canvas=$('#pdfCanvas');
                const ctx=canvas.getContext('2d');
                const offscreen=document.createElement('canvas');
                offscreen.width=vp.width;
                offscreen.height=vp.height;
                const offCtx=offscreen.getContext('2d');
                this._renderTask=page.render({canvasContext:offCtx,viewport:vp});
                await this._renderTask.promise;
                this._renderTask=null;
                canvas.width=vp.width;
                canvas.height=vp.height;
                ctx.drawImage(offscreen,0,0);

                const container=$('#pdfCanvasContainer');
                container.style.width=vp.width+'px';
                container.style.height=vp.height+'px';

                this._pageCache[key]=offscreen;

                const cacheKeys=Object.keys(this._pageCache);
                if(cacheKeys.length>30){
                    delete this._pageCache[cacheKeys[0]];
                }

                this.renderAnnotations();
            }catch(e){if(e.message&&(e.message.includes('cancel')||e.message.includes('Todo')))return;console.error('Render error',e);}
        },

        renderAnnotations(){
            const layer=$('#annotationsLayer');
            layer.innerHTML='';
            this.annotations.filter(a=>a.page===this.currentPage).forEach(a=>{
                const el=document.createElement('div');
                el.className='annotation annotation-'+a.type;
                el.dataset.id=a.id;
                el.style.left=a.x+'px';
                el.style.top=a.y+'px';
                if(a.w)el.style.width=a.w+'px';
                if(a.h)el.style.height=a.h+'px';
                if(a.type==='text'||a.type==='highlight'||a.type==='underline'||a.type==='strikethrough'){
                    el.textContent=a.text||'';
                    el.style.background=a.color+'40';
                    el.style.color=a.color||'#000';
                    if(a.type==='underline')el.style.borderBottom='2px solid '+a.color;
                    if(a.type==='strikethrough')el.style.textDecoration='line-through';
                }
                if(a.type==='rect'){
                    el.style.border='2px solid '+a.color;
                    el.style.background='transparent';
                }
                if(a.type==='line'){
                    el.style.height=(a.size||2)+'px';
                    el.style.background=a.color;
                    el.style.transformOrigin='0 50%';
                    el.style.transform='rotate('+a.angle+'deg)';
                }
                layer.appendChild(el);
            });
        },

        goToPage(num){
            if(!this.pdfDoc)return;
            num=Math.max(1,Math.min(this.totalPages,num));
            this.currentPage=num;
            if(this.viewMode==='continuous'){
                this.renderContinuous();
            }else{
                this.renderPage(num);
            }
            document.getElementById('pageInput').value=num;
            document.getElementById('barPageInput').value=num;
            this.updateProgress();
            this.highlightThumbnail(num);
            this.savePageState();
        },

        async renderContinuous(){
            const viewer=$('#pdfViewer');
            viewer.innerHTML='';
            viewer.style.overflow='auto';
            const start=Math.max(1,this.currentPage-2);
            const end=Math.min(this.totalPages,this.currentPage+4);
            for(let i=start;i<=end;i++){
                const page=await this.pdfDoc.getPage(i);
                const vp=page.getViewport({scale:this.zoom,rotation:this.rotation});
                const wrapper=document.createElement('div');
                wrapper.className='continuous-page';
                wrapper.style.margin='8px auto';
                wrapper.dataset.page=i;
                const canvas=document.createElement('canvas');
                canvas.width=vp.width;
                canvas.height=vp.height;
                canvas.style.boxShadow='0 2px 12px rgba(0,0,0,.3)';
                canvas.style.display='block';
                wrapper.appendChild(canvas);
                const ctx=canvas.getContext('2d');
                await page.render({canvasContext:ctx,viewport:vp}).promise;
                viewer.appendChild(wrapper);
            }
        },

        setViewMode(mode){
            this.viewMode=mode;
            $$('.view-btn').forEach(b=>b.classList.remove('active'));
            if(mode==='single')$('#btnViewSingle').classList.add('active');
            if(mode==='double')$('#btnViewDouble').classList.add('active');
            if(mode==='continuous')$('#btnViewContinuous').classList.add('active');
            if(mode==='continuous')this.renderContinuous();
            else{
                const viewer=$('#pdfViewer');
                viewer.style.overflow='hidden';
                this.renderPage(this.currentPage);
            }
        },

        setZoom(z){
            this.zoom=Math.max(0.25,Math.min(5,z));
            this.zoomMode='custom';
            document.getElementById('zoomSelect').value='custom';
            this.updateZoomDisplay();
            if(this.viewMode==='continuous')this.renderContinuous();
            else this.renderPage(this.currentPage);
        },

        fitPage(){
            if(!this.pdfDoc)return;
            this.pdfDoc.getPage(this.currentPage).then(page=>{
                const vp=page.getViewport({rotation:this.rotation});
                const viewerW=$('#pdfViewer').clientWidth-32;
                const viewerH=$('#pdfViewer').clientHeight-32;
                this.zoom=Math.min(viewerW/vp.width,viewerH/vp.height);
                this.updateZoomDisplay();
                this.renderPage(this.currentPage);
            });
        },

        fitWidth(){
            if(!this.pdfDoc)return;
            this.pdfDoc.getPage(this.currentPage).then(page=>{
                const vp=page.getViewport({rotation:this.rotation});
                const viewerW=$('#pdfViewer').clientWidth-32;
                this.zoom=viewerW/vp.width;
                this.updateZoomDisplay();
                this.renderPage(this.currentPage);
            });
        },

        updateZoomDisplay(){
            const pct=Math.round(this.zoom*100);
            document.getElementById('zoomValue').textContent=pct+'%';
            document.getElementById('barZoomValue').textContent=pct+'%';
        },

        updateProgress(){
            const pct=Math.round((this.currentPage/this.totalPages)*100);
            document.getElementById('barProgressFill').style.width=pct+'%';
            document.getElementById('barPercent').textContent=pct+'%';
        },

        rotatePage(){
            this.rotation=(this.rotation+90)%360;
            this.renderPage(this.currentPage);
        },

        generateThumbnails(){
            const container=$('#thumbnailsContainer');
            container.innerHTML='';
            this._thumbObserverCleanup&&this._thumbObserverCleanup();
            for(let i=1;i<=this.totalPages;i++){
                const item=document.createElement('div');
                item.className='thumbnail-item';
                item.dataset.page=i;
                if(i===1)item.classList.add('active');
                const canvas=document.createElement('canvas');
                canvas.className='thumbnail-canvas';
                canvas.dataset.page=i;
                const label=document.createElement('div');
                label.className='thumbnail-label';
                label.textContent=i;
                item.appendChild(canvas);
                item.appendChild(label);
                item.addEventListener('click',()=>this.goToPage(i));
                container.appendChild(item);
            }
            if(typeof IntersectionObserver!=='undefined'){
                const obs=new IntersectionObserver(entries=>{
                    entries.forEach(entry=>{
                        if(entry.isIntersecting){
                            const c=entry.target;
                            if(!c.dataset.rendered){
                                c.dataset.rendered='1';
                                this.renderThumbnail(parseInt(c.dataset.page),c);
                            }
                            obs.unobserve(c);
                        }
                    });
                    if(!this._thumbsObs)this._thumbsObs=obs;
                },{root:container,rootMargin:'200px'});
                this._thumbsObs=obs;
                container.querySelectorAll('.thumbnail-canvas').forEach(c=>obs.observe(c));
                this._thumbObserverCleanup=()=>{obs.disconnect();this._thumbsObs=null;};
            }else{
                for(let i=1;i<=this.totalPages;i++){
                    const c=container.querySelector(`.thumbnail-canvas[data-page="${i}"]`);
                    if(c)this.renderThumbnail(i,c);
                }
            }
        },

        async renderThumbnail(num,canvas){
            if(!this.pdfDoc)return;
            const page=await this.pdfDoc.getPage(num);
            const vp=page.getViewport({scale:.2});
            canvas.width=vp.width;
            canvas.height=vp.height;
            const ctx=canvas.getContext('2d');
            await page.render({canvasContext:ctx,viewport:vp}).promise;
        },

        highlightThumbnail(num){
            $$('.thumbnail-item').forEach(t=>t.classList.remove('active'));
            const t=$(`.thumbnail-item[data-page="${num}"]`);
            if(t){t.classList.add('active');t.scrollIntoView({behavior:'smooth',block:'nearest'});}
        },

        async loadOutline(){
            if(!this.pdfDoc)return;
            try{
                const outline=await this.pdfDoc.getOutline();
                const list=$('#outlineList');
                if(!outline||outline.length===0){
                    list.innerHTML='<p class="empty-message">Оглавление отсутствует</p>';
                    return;
                }
                list.innerHTML='';
                const renderItems=(items,level)=>{
                    items.forEach(item=>{
                        const el=document.createElement('div');
                        el.className='outline-item level-'+level;
                        el.textContent=item.title;
                        el.addEventListener('click',()=>{
                            if(item.dest){
                                this.pdfDoc.getDestination(item.dest).then(dest=>{
                                    if(dest)this.pdfDoc.getPageIndex(dest[0]).then(idx=>this.goToPage(idx+1));
                                });
                            }
                        });
                        list.appendChild(el);
                        if(item.items&&item.items.length)renderItems(item.items,level+1);
                    });
                };
                renderItems(outline,0);
            }catch(e){console.log('Outline error',e);}
        },

        async doSearch(query){
            this.currentSearch=query;
            this.searchResults=[];
            this.searchIndex=-1;
            if(!query||query.length<2){
                $('#searchCount').textContent='0 из 0';
                return;
            }
            const lower=query.toLowerCase();
            for(let i=1;i<=this.totalPages;i++){
                const page=await this.pdfDoc.getPage(i);
                const tc=await page.getTextContent();
                tc.items.forEach(item=>{
                    if(item.str.toLowerCase().includes(lower)){
                        this.searchResults.push({page:i,str:item.str,transform:item.transform});
                    }
                });
            }
            if(this.searchResults.length>0){
                this.searchIndex=0;
                this.goToPage(this.searchResults[0].page);
            }
            $('#searchCount').textContent=(this.searchResults.length>0?(this.searchIndex+1):0)+' из '+this.searchResults.length;
        },

        searchPrev(){
            if(this.searchResults.length===0)return;
            this.searchIndex=(this.searchIndex-1+this.searchResults.length)%this.searchResults.length;
            this.goToPage(this.searchResults[this.searchIndex].page);
            $('#searchCount').textContent=(this.searchIndex+1)+' из '+this.searchResults.length;
        },

        searchNext(){
            if(this.searchResults.length===0)return;
            this.searchIndex=(this.searchIndex+1)%this.searchResults.length;
            this.goToPage(this.searchResults[this.searchIndex].page);
            $('#searchCount').textContent=(this.searchIndex+1)+' из '+this.searchResults.length;
        },

        startTextSelection(e){
            const rect=e.target.closest('.pdf-canvas-container').getBoundingClientRect();
            const x=e.clientX-rect.left;
            const y=e.clientY-rect.top;
            const id='ann_'+Date.now();
            const ann={id,type:this.currentTool,page:this.currentPage,x,y,w:120,h:24,color:this.editColor,text:'Текст',fontSize:parseInt($('#editSize').value)||14};
            this.pushAnnotation(ann);
            this.renderAnnotations();
        },

        addShapeAnnotation(e){
            const rect=e.target.closest('.pdf-canvas-container').getBoundingClientRect();
            const x=e.clientX-rect.left;
            const y=e.clientY-rect.top;
            const id='ann_'+Date.now();
            if(this.currentTool==='text'){
                $('#textModal').style.display='flex';
                $('#addTextInput').value='';
                $('#textModal').dataset.x=x;
                $('#textModal').dataset.y=y;
                return;
            }
            const ann={id,type:this.currentTool,page:this.currentPage,x,y,w:100,h:this.currentTool==='rect'?60:2,color:this.editColor,size:parseInt($('#editSize').value)||2};
            if(this.currentTool==='line')ann.angle=0;
            this.pushAnnotation(ann);
            this.renderAnnotations();
        },

        saveTextAnnotation(){
            const x=parseFloat($('#textModal').dataset.x);
            const y=parseFloat($('#textModal').dataset.y);
            const text=$('#addTextInput').value;
            if(!text.trim())return;
            const ann={id:'ann_'+Date.now(),type:'text',page:this.currentPage,x,y,w:200,h:30,color:$('#textColor').value,text,fontSize:parseInt($('#textFontSize').value)||14};
            this.pushAnnotation(ann);
            this.renderAnnotations();
            $('#textModal').style.display='none';
        },

        pushAnnotation(ann){
            this.history=this.history.slice(0,this.historyIndex+1);
            this.annotations.push(ann);
            this.history.push({action:'add',data:ann});
            this.historyIndex++;
            this.saveAnnotations();
        },

        undo(){
            if(this.historyIndex<0)return;
            const h=this.history[this.historyIndex];
            if(h.action==='add'){
                this.annotations=this.annotations.filter(a=>a.id!==h.data.id);
            }else if(h.action==='delete'){
                this.annotations.push(h.data);
            }
            this.historyIndex--;
            this.renderAnnotations();
            this.saveAnnotations();
        },

        redo(){
            if(this.historyIndex>=this.history.length-1)return;
            this.historyIndex++;
            const h=this.history[this.historyIndex];
            if(h.action==='add'){
                this.annotations.push(h.data);
            }else if(h.action==='delete'){
                this.annotations=this.annotations.filter(a=>a.id!==h.data.id);
            }
            this.renderAnnotations();
            this.saveAnnotations();
        },

        deleteSelected(){
            if(!this.selectedAnnotation)return;
            const ann=this.annotations.find(a=>a.id===this.selectedAnnotation);
            if(!ann)return;
            this.history=this.history.slice(0,this.historyIndex+1);
            this.history.push({action:'delete',data:ann});
            this.historyIndex++;
            this.annotations=this.annotations.filter(a=>a.id!==this.selectedAnnotation);
            this.selectedAnnotation=null;
            this.renderAnnotations();
            this.saveAnnotations();
        },

        addBookmark(){
            $('#bookmarkModal').style.display='flex';
            $('#bookmarkName').value='';
            $('#bookmarkPageNum').textContent=this.currentPage;
        },

        saveBookmark(){
            const name=$('#bookmarkName').value.trim();
            if(!name)return;
            this.bookmarks.push({id:'bm_'+Date.now(),name,page:this.currentPage,date:new Date().toLocaleDateString('ru-RU')});
            this.saveBookmarks();
            this.renderBookmarks();
            $('#bookmarkModal').style.display='none';
            this.showToast('Закладка добавлена');
        },

        renderBookmarks(){
            const list=$('#bookmarksList');
            if(!this.bookmarks.length){list.innerHTML='<p class="empty-message">Нет закладок</p>';return;}
            list.innerHTML='';
            this.bookmarks.forEach(bm=>{
                const el=document.createElement('div');
                el.className='bookmark-item';
                el.innerHTML=`<div class="bm-title">${bm.name}</div><div class="bm-page">Стр. ${bm.page} · ${bm.date}</div><div class="note-actions"><button class="bm-delete" data-id="${bm.id}">Удалить</button></div>`;
                el.querySelector('.bm-title').addEventListener('click',()=>this.goToPage(bm.page));
                el.querySelector('.bm-delete').addEventListener('click',e=>{
                    e.stopPropagation();
                    this.bookmarks=this.bookmarks.filter(b=>b.id!==bm.id);
                    this.saveBookmarks();
                    this.renderBookmarks();
                });
                list.appendChild(el);
            });
        },

        addNote(){
            $('#noteModal').style.display='flex';
            $('#noteTitle').value='';
            $('#noteText').value='';
            $('#notePageNum').textContent=this.currentPage;
        },

        saveNote(){
            const title=$('#noteTitle').value.trim();
            const text=$('#noteText').value.trim();
            if(!title&&!text)return;
            this.notes.push({id:'nt_'+Date.now(),title,title,text,text,page:this.currentPage,date:new Date().toLocaleDateString('ru-RU')});
            this.saveNotes();
            this.renderNotes();
            $('#noteModal').style.display='none';
            this.showToast('Заметка добавлена');
        },

        renderNotes(){
            const list=$('#notesList');
            if(!this.notes.length){list.innerHTML='<p class="empty-message">Нет заметок</p>';return;}
            list.innerHTML='';
            this.notes.forEach(nt=>{
                const el=document.createElement('div');
                el.className='note-item';
                el.innerHTML=`<div class="note-title">${nt.title||'Без названия'}</div><div class="note-text">${nt.text||''}</div><div class="note-date">Стр. ${nt.page} · ${nt.date}</div><div class="note-actions"><button class="note-delete" data-id="${nt.id}">Удалить</button></div>`;
                el.querySelector('.note-title').addEventListener('click',()=>this.goToPage(nt.page));
                el.querySelector('.note-delete').addEventListener('click',e=>{
                    e.stopPropagation();
                    this.notes=this.notes.filter(n=>n.id!==nt.id);
                    this.saveNotes();
                    this.renderNotes();
                });
                list.appendChild(el);
            });
        },

        printPDF(){
            if(!this.fileData){this.showToast('Нет файла для печати');return;}
            const blob=new Blob([this.fileData],{type:'application/pdf'});
            const url=URL.createObjectURL(blob);
            const w=window.open(url);
            if(w){w.onload=()=>{w.print();};}
            this.showToast('Откройте диалог печати (Ctrl+P)');
        },

        downloadPDF(){
            if(!this.fileData){this.showToast('Нет файла для скачивания');return;}
            const blob=new Blob([this.fileData],{type:'application/pdf'});
            const url=URL.createObjectURL(blob);
            const a=document.createElement('a');
            a.href=url;a.download=this.fileName;document.body.appendChild(a);a.click();
            setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},100);
            this.showToast('Файл скачан');
        },

        saveCopy(){
            if(!this.fileData){this.showToast('Нет файла для сохранения');return;}
            this.downloadPDF();
            this.showToast('Копия сохранена');
        },

        getSavedData(){
            try{return JSON.parse(localStorage.getItem('doc_'+this.fileId));}catch(e){return null;}
        },

        savePageState(){
            const data={currentPage:this.currentPage,zoom:this.zoom,zoomMode:this.zoomMode};
            localStorage.setItem('doc_'+this.fileId,JSON.stringify(data));
        },

        saveAnnotations(){
            localStorage.setItem('ann_'+this.fileId,JSON.stringify(this.annotations));
        },

        loadData(){
            try{
                const anns=localStorage.getItem('ann_'+this.fileId);
                if(anns)this.annotations=JSON.parse(anns);
                const bms=localStorage.getItem('bm_'+this.fileId);
                if(bms)this.bookmarks=JSON.parse(bms);
                const nts=localStorage.getItem('nt_'+this.fileId);
                if(nts)this.notes=JSON.parse(nts);
            }catch(e){}
            this.renderBookmarks();
            this.renderNotes();
        },

        saveBookmarks(){localStorage.setItem('bm_'+this.fileId,JSON.stringify(this.bookmarks));},
        saveNotes(){localStorage.setItem('nt_'+this.fileId,JSON.stringify(this.notes));},

        getRecentDocs(){
            try{return JSON.parse(localStorage.getItem('recentDocs')||'[]');}catch(e){return[];}
        },

        saveRecentDocs(docs){localStorage.setItem('recentDocs',JSON.stringify(docs));},

        updateRecentDocs(){
            let docs=this.getRecentDocs();
            docs=docs.filter(d=>d.id!==this.fileId);
            docs.unshift({id:this.fileId,name:this.fileName,date:new Date().toLocaleDateString('ru-RU')});
            if(docs.length>20)docs=docs.slice(0,20);
            this.saveRecentDocs(docs);
            this.renderRecentDocs();
        },

        renderRecentDocs(){
            const docs=this.getRecentDocs();
            const section=$('#recentSection');
            const grid=$('#recentGrid');
            if(!docs.length){section.style.display='none';return;}
            section.style.display='block';
            grid.innerHTML='';
            docs.forEach(doc=>{
                const el=document.createElement('div');
                el.className='recent-item';
                el.innerHTML=`<div class="recent-item-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div><div class="recent-item-info"><div class="recent-item-name">${doc.name}</div><div class="recent-item-meta">${doc.date}</div></div><button class="recent-item-delete" data-id="${doc.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
                el.addEventListener('click',e=>{
                    if(e.target.closest('.recent-item-delete'))return;
                    self.openRecentDoc(doc.id,doc.name);
                });
                el.querySelector('.recent-item-delete').addEventListener('click',e=>{
                    e.stopPropagation();
                    const id=e.currentTarget.dataset.id;
                    const list=self.getRecentDocs().filter(d=>d.id!==id);
                    self.saveRecentDocs(list);
                    self.deleteFileFromDB(id);
                    self.renderRecentDocs();
                });
                grid.appendChild(el);
            });
            var self=this;
        },

        async openRecentDoc(fileId,fileName,silent){
            if(!silent)this.showToast('Загрузка...');
            this.fileName=fileName;
            this.fileId=fileId;
            this.showUI();
            document.getElementById('docTitle').textContent=fileName;

            let data=null;
            let lastError=null;

            // После перезагрузки страницы IndexedDB иногда ещё не успевает
            // полностью открыть соединение. Несколько коротких повторов не дают
            // временной ошибке выглядеть как потерянный PDF.
            for(let attempt=0;attempt<4;attempt++){
                try{
                    await this._openDB();
                    data=await this.loadFileFromDB(fileId);
                    if(data&&data.length)break;
                }catch(e){
                    lastError=e;
                    console.log('DB load attempt '+(attempt+1)+' failed',e);
                    this._dbConn=null;
                    this._dbOpenPromise=null;
                }

                if(attempt<3){
                    await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));
                }
            }

            if(!data||!data.length){
                console.log('PDF data not available after retries',lastError||'no data');
                if(silent){
                    localStorage.removeItem('lastOpenedFileId');
                }else{
                    this.showToast('Файл сейчас не удалось открыть. Выберите исходный PDF заново.');
                }

                // ВАЖНО: здесь ничего не удаляем ни из recentDocs, ни из IndexedDB.
                // Временная ошибка чтения не должна уничтожать сохранённый файл.
                this.goHome();
                return;
            }

            this.fileData=new Uint8Array(data);
            try{
                this.pdfDoc=await pdfjsLib.getDocument({data:this.fileData}).promise;
            }catch(e){
                console.log('PDF parse error, data length='+data.length,e);
                if(silent){
                    localStorage.removeItem('lastOpenedFileId');
                }else{
                    this.showToast('Не удалось прочитать PDF. Откройте исходный файл заново.');
                }

                // Даже при ошибке PDF.js сохранённую копию автоматически не удаляем.
                this.goHome();
                return;
            }

            this._pageCache={};
            this.totalPages=this.pdfDoc.numPages;
            this.currentPage=1;
            this.rotation=0;
            this.annotations=[];
            this.bookmarks=[];
            this.notes=[];
            this.history=[];
            this.historyIndex=-1;

            document.getElementById('totalPages').textContent=this.totalPages;
            document.getElementById('barTotalPages').textContent=this.totalPages;
            this.updateZoomDisplay();

            const saved=this.getSavedData();
            const startPage=(saved&&saved.currentPage>1)?saved.currentPage:1;
            this.goToPage(startPage);
            this.loadData();
            this.loadOutline();
            this.generateThumbnails();
            this.updateRecentDocs();
            localStorage.setItem('lastOpenedFileId',this.fileId);
        },

        _openDB(){
            if(this._dbConn)return Promise.resolve(this._dbConn);
            if(this._dbOpenPromise)return this._dbOpenPromise;

            this._dbOpenPromise=new Promise((resolve,reject)=>{
                const req=indexedDB.open('DocumentsPDF',3);

                req.onupgradeneeded=e=>{
                    const db=e.target.result;
                    if(!db.objectStoreNames.contains('files')){
                        db.createObjectStore('files');
                    }
                };

                req.onsuccess=e=>{
                    this._dbConn=e.target.result;
                    this._dbConn.onclose=()=>{
                        this._dbConn=null;
                        this._dbOpenPromise=null;
                    };
                    this._dbConn.onversionchange=()=>{
                        this._dbConn.close();
                        this._dbConn=null;
                        this._dbOpenPromise=null;
                    };
                    resolve(this._dbConn);
                };

                req.onerror=()=>{
                    this._dbOpenPromise=null;
                    reject(req.error);
                };

                req.onblocked=()=>{
                    console.warn('IndexedDB open is blocked by another connection');
                };
            });

            return this._dbOpenPromise;
        },

        async saveFileToDB(id,data){
            const db=await this._openDB();
            return new Promise((resolve,reject)=>{
                const tx=db.transaction('files','readwrite');
                tx.objectStore('files').put(data,id);
                tx.oncomplete=()=>resolve();
                tx.onerror=()=>reject(tx.error);
            });
        },

        async loadFileFromDB(id){
            const db=await this._openDB();
            return new Promise((resolve,reject)=>{
                const tx=db.transaction('files','readonly');
                const r=tx.objectStore('files').get(id);
                r.onsuccess=()=>resolve(r.result);
                r.onerror=()=>reject(r.error);
            });
        },

        async deleteFileFromDB(id){
            const db=await this._openDB();
            return new Promise((resolve,reject)=>{
                const tx=db.transaction('files','readwrite');
                tx.objectStore('files').delete(id);
                tx.oncomplete=()=>resolve();
                tx.onerror=()=>reject(tx.error);
            });
        },

        showToast(msg){
            const t=$('#toast');
            const m=$('#toastMessage');
            m.textContent=msg;
            t.style.display='block';
            t.classList.add('show');
            setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.style.display='none',300);},2000);
        }
    };

    document.addEventListener('DOMContentLoaded',()=>{
        App.init();
        App.renderRecentDocs();
    });
