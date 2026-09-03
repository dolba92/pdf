pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const App={
    pdfDoc:null,
    currentPage:1,
    totalPages:0,
    scale:1.5,
    zoomMode:'fit-width',
    fileName:'',
    fileId:'',
    fileData:null,
    annotations:[],
    bookmarks:[],
    notes:[],
    history:[],
    historyIndex:-1,
    editMode:false,
    editTool:'highlight',
    sidebarOpen:false,
    sidebarTab:'pages',
    viewMode:'single',
    rotation:0,
    searchQuery:'',
    searchResults:[],
    searchIndex:-1,
    currentDrawAnnotation:null,
    selectedAnnotation:null,
    lastSavedPage:1,
    db:null,

    async init(){
        await this.initDB();
        this.bindEvents();
        this.loadRecentDocs();
    },

    genId(s){let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0}return Math.abs(h).toString(36)},

    esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML},

    initDB(){
        return new Promise((resolve,reject)=>{
            const req=indexedDB.open('DocumentsPDF',1);
            req.onupgradeneeded=(e)=>{
                const db=e.target.result;
                if(!db.objectStoreNames.contains('files')){
                    db.createObjectStore('files',{keyPath:'id'});
                }
            };
            req.onsuccess=(e)=>{this.db=e.target.result;resolve()};
            req.onerror=()=>reject(req.error);
        });
    },

    saveFileToDB(id,data){
        return new Promise((resolve,reject)=>{
            if(!this.db){resolve();return}
            const tx=this.db.transaction('files','readwrite');
            tx.objectStore('files').put({id,data});
            tx.oncomplete=()=>resolve();
            tx.onerror=()=>reject(tx.error);
        });
    },

    loadFileFromDB(id){
        return new Promise((resolve,reject)=>{
            if(!this.db){resolve(null);return}
            const tx=this.db.transaction('files','readonly');
            const req=tx.objectStore('files').get(id);
            req.onsuccess=()=>resolve(req.result?req.result.data:null);
            req.onerror=()=>resolve(null);
        });
    },

    deleteFileFromDB(id){
        return new Promise((resolve)=>{
            if(!this.db){resolve();return}
            const tx=this.db.transaction('files','readwrite');
            tx.objectStore('files').delete(id);
            tx.oncomplete=()=>resolve();
            tx.onerror=()=>resolve();
        });
    },

    bindEvents(){
        const $=s=>document.querySelector(s);
        $('#btnOpenPdf').onclick=()=>$('#fileInput').click();
        $('#uploadArea').onclick=(e)=>{if(e.target===$('#uploadArea')||e.target.closest('.upload-icon')||e.target===$('#btnOpenPdf')||e.target.closest('.btn-open-pdf'))$('#fileInput').click()};
        $('#fileInput').onchange=(e)=>{if(e.target.files[0])this.loadPDF(e.target.files[0])};
        const ua=$('#uploadArea');
        ua.ondragover=(e)=>{e.preventDefault();ua.classList.add('dragover')};
        ua.ondragleave=()=>ua.classList.remove('dragover');
        ua.ondrop=(e)=>{e.preventDefault();ua.classList.remove('dragover');if(e.dataTransfer.files[0])this.loadPDF(e.dataTransfer.files[0])};

        $('#btnBackToHome').onclick=()=>this.goHome();
        $('#btnPrevPage').onclick=()=>this.goToPage(this.currentPage-1);
        $('#btnNextPage').onclick=()=>this.goToPage(this.currentPage+1);
        $('#pageInput').onchange=(e)=>this.goToPage(parseInt(e.target.value));
        $('#pageInput').onkeydown=(e)=>{if(e.key==='Enter'){e.preventDefault();this.goToPage(parseInt(e.target.value))}};

        $('#btnZoomIn').onclick=()=>this.zoom(0.1);
        $('#btnZoomOut').onclick=()=>this.zoom(-0.1);
        $('#zoomSelect').onchange=(e)=>{this.zoomMode=e.target.value;this.render()};
        $('#zoomValue').onclick=()=>{this.zoomMode='100';this.scale=1.5;$('#zoomSelect').value='100';this.render()};

        $('#btnViewSingle').onclick=()=>this.setViewMode('single');
        $('#btnViewDouble').onclick=()=>this.setViewMode('double');
        $('#btnViewContinuous').onclick=()=>this.setViewMode('continuous');

        $('#btnSidebar').onclick=()=>this.toggleSidebar();
        $('#btnSearch').onclick=()=>this.toggleSearch();
        $('#btnEditToggle').onclick=()=>this.toggleEditMode();
        $('#btnRotate').onclick=()=>this.rotatePage();
        $('#btnFullscreen').onclick=()=>this.toggleFullscreen();
        $('#btnMenu').onclick=(e)=>{e.stopPropagation();$('#dropdownMenu').classList.toggle('show')};
        document.addEventListener('click',()=>$('#dropdownMenu').classList.remove('show'));

        $('#btnPrint').onclick=()=>this.printPDF();
        $('#btnDownload').onclick=()=>this.downloadPDF();
        $('#btnSaveCopy').onclick=()=>this.saveCopy();
        $('#btnBookmarks').onclick=()=>this.showBookmarkModal();
        $('#btnNotes').onclick=()=>this.showNoteModal();
        $('#btnShowOutline').onclick=()=>{this.toggleSidebar();this.switchTab('outline')};

        $('#searchInput').oninput=(e)=>this.search(e.target.value);
        $('#btnSearchPrev').onclick=()=>this.searchPrev();
        $('#btnSearchNext').onclick=()=>this.searchNext();
        $('#btnSearchClose').onclick=()=>this.toggleSearch();

        document.querySelectorAll('.sidebar-tab').forEach(t=>{
            t.onclick=()=>this.switchTab(t.dataset.tab);
        });

        document.querySelectorAll('.edit-tool-btn[data-tool]').forEach(b=>{
            b.onclick=()=>{this.editTool=b.dataset.tool;document.querySelectorAll('.edit-tool-btn[data-tool]').forEach(x=>x.classList.remove('active'));b.classList.add('active')};
        });
        $('#btnUndo').onclick=()=>this.undo();
        $('#btnRedo').onclick=()=>this.redo();
        $('#btnDeleteAnnotation').onclick=()=>this.deleteSelectedAnnotation();

        $('#closeNoteModal').onclick=$('#cancelNote').onclick=()=>document.getElementById('noteModal').style.display='none';
        $('#saveNote').onclick=()=>this.saveNote();
        $('#closeBookmarkModal').onclick=$('#cancelBookmark').onclick=()=>document.getElementById('bookmarkModal').style.display='none';
        $('#saveBookmark').onclick=()=>this.saveBookmark();
        $('#closeTextModal').onclick=$('#cancelText').onclick=()=>document.getElementById('textModal').style.display='none';
        $('#saveText').onclick=()=>this.saveTextAnnotation();
        $('#continueFromStart').onclick=()=>{$('#continueModal').style.display='none';this.goToPage(1)};
        $('#continueFromLast').onclick=()=>{$('#continueModal').style.display='none';this.goToPage(this.lastSavedPage||1)};

        $('#btnAddBookmark').onclick=()=>this.showBookmarkModal();
        $('#btnAddNote').onclick=()=>this.showNoteModal();

        document.addEventListener('keydown',(e)=>this.handleKeydown(e));

        const viewer=$('#pdfViewer');
        viewer.addEventListener('wheel',(e)=>{if(e.ctrlKey){e.preventDefault();this.zoom(e.deltaY>0?-0.05:0.05)}},{passive:false});

        let touchStartX=0;
        viewer.addEventListener('touchstart',(e)=>{touchStartX=e.touches[0].clientX});
        viewer.addEventListener('touchend',(e)=>{
            const dx=e.changedTouches[0].clientX-touchStartX;
            if(Math.abs(dx)>60){dx<0?this.goToPage(this.currentPage+1):this.goToPage(this.currentPage-1)}
        });

        this.setupDrawEvents();

        window.addEventListener('resize',()=>{
            if(this.pdfDoc){
                if(this.zoomMode==='fit-width'||this.zoomMode==='fit-page'){
                    this.render();
                }
            }
        });
    },

    async loadPDF(file){
        this.fileName=file.name;
        this.fileId=this.genId(file.name+file.size+file.lastModified);
        const buf=await file.arrayBuffer();
        this.fileData=Array.from(new Uint8Array(buf));
        try{
            this.pdfDoc=await pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
        }catch(e){
            alert('Ошибка загрузки PDF: '+e.message);return;
        }
        this.totalPages=this.pdfDoc.numPages;
        this.currentPage=1;
        this.rotation=0;
        this.annotations=[];
        this.bookmarks=[];
        this.notes=[];
        this.history=[];
        this.historyIndex=-1;

        await this.saveFileToDB(this.fileId,this.fileData);
        this.loadData();
        this.loadOutline();
        document.getElementById('homeScreen').style.display='none';
        document.getElementById('readerScreen').style.display='flex';
        document.getElementById('docTitle').textContent=this.fileName;
        document.getElementById('totalPages').textContent=this.totalPages;
        this.updateZoomDisplay();

        const saved=this.getSavedData();
        if(saved&&saved.currentPage>1){
            this.lastSavedPage=saved.currentPage;
            document.getElementById('continuePageNum').textContent=saved.currentPage;
            document.getElementById('continueModal').style.display='flex';
        }else{
            this.goToPage(1);
        }
        this.generateThumbnails();
        this.updateRecentDocs();
    },

    async openRecentDoc(fileId,fileName){
        this.showToast('Загрузка...');
        const data=await this.loadFileFromDB(fileId);
        if(!data){
            this.showToast('Файл не найден. Откройте его заново.');
            return;
        }
        this.fileName=fileName;
        this.fileId=fileId;
        this.fileData=data;
        try{
            this.pdfDoc=await pdfjsLib.getDocument({data:new Uint8Array(data)}).promise;
        }catch(e){
            alert('Ошибка загрузки PDF: '+e.message);return;
        }
        this.totalPages=this.pdfDoc.numPages;
        this.currentPage=1;
        this.rotation=0;
        this.annotations=[];
        this.bookmarks=[];
        this.notes=[];
        this.history=[];
        this.historyIndex=-1;

        this.loadData();
        this.loadOutline();
        document.getElementById('homeScreen').style.display='none';
        document.getElementById('readerScreen').style.display='flex';
        document.getElementById('docTitle').textContent=this.fileName;
        document.getElementById('totalPages').textContent=this.totalPages;
        this.updateZoomDisplay();

        const saved=this.getSavedData();
        if(saved&&saved.currentPage>1){
            this.lastSavedPage=saved.currentPage;
            document.getElementById('continuePageNum').textContent=saved.currentPage;
            document.getElementById('continueModal').style.display='flex';
        }else{
            this.goToPage(1);
        }
        this.generateThumbnails();
        this.updateRecentDocs();
    },

    render(){
        if(this.viewMode==='continuous')this.renderContinuous();
        else if(this.viewMode==='double')this.renderDouble();
        else this.renderPage();
    },

    async renderPage(){
        if(!this.pdfDoc)return;
        const page=await this.pdfDoc.getPage(this.currentPage);
        const unscaled=page.getViewport({scale:1});
        const viewer=document.getElementById('pdfViewer');
        const vw=viewer.clientWidth-40;
        const vh=viewer.clientHeight-40;
        if(this.zoomMode==='fit-width'){
            this.scale=vw/unscaled.width;
        }else if(this.zoomMode==='fit-page'){
            this.scale=Math.min(vw/unscaled.width,vh/unscaled.height);
        }else{
            const num=parseFloat(this.zoomMode);
            if(!isNaN(num))this.scale=num/100;
        }
        this.updateZoomDisplay();
        const vp=page.getViewport({scale:this.scale,rotation:this.rotation});
        const canvas=document.getElementById('pdfCanvas');
        const ctx=canvas.getContext('2d');
        canvas.width=vp.width;
        canvas.height=vp.height;
        await page.render({canvasContext:ctx,viewport:vp}).promise;
        this.drawAnnotations();
        this.updateStatus();
        this.updateThumbnailActive();
    },

    async renderContinuous(){
        if(!this.pdfDoc)return;
        const container=document.getElementById('pdfCanvasContainer');
        container.innerHTML='';
        container.classList.add('continuous-pages');
        for(let i=1;i<=this.totalPages;i++){
            const page=await this.pdfDoc.getPage(i);
            const vp=page.getViewport({scale:this.scale,rotation:this.rotation});
            const wrap=document.createElement('div');
            wrap.className='page-wrapper';
            wrap.dataset.page=i;
            const c=document.createElement('canvas');
            c.width=vp.width;c.height=vp.height;
            const ctx=c.getContext('2d');
            wrap.appendChild(c);
            container.appendChild(wrap);
            page.render({canvasContext:ctx,viewport:vp});
        }
        this.updateStatus();
    },

    async renderDouble(){
        if(!this.pdfDoc)return;
        const container=document.getElementById('pdfCanvasContainer');
        container.innerHTML='';
        container.classList.remove('continuous-pages');
        const pages=[this.currentPage];
        if(this.currentPage<this.totalPages)pages.push(this.currentPage+1);
        const row=document.createElement('div');
        row.className='page-double';
        for(const pnum of pages){
            const page=await this.pdfDoc.getPage(pnum);
            const vp=page.getViewport({scale:this.scale,rotation:this.rotation});
            const wrap=document.createElement('div');
            wrap.className='page-wrapper';
            wrap.dataset.page=pnum;
            const c=document.createElement('canvas');
            c.width=vp.width;c.height=vp.height;
            const ctx=c.getContext('2d');
            wrap.appendChild(c);
            row.appendChild(wrap);
            page.render({canvasContext:ctx,viewport:vp});
        }
        container.appendChild(row);
        this.updateStatus();
    },

    async goToPage(n){
        n=Math.max(1,Math.min(this.totalPages,n));
        this.currentPage=n;
        document.getElementById('pageInput').value=n;
        this.saveData();
        if(this.viewMode==='continuous'){
            await this.renderContinuous();
            const target=document.querySelector(`.page-wrapper[data-page="${n}"]`);
            if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
        }else if(this.viewMode==='double'){
            await this.renderDouble();
        }else{
            await this.renderPage();
        }
    },

    zoom(delta){
        this.scale=Math.max(0.25,Math.min(5,this.scale+delta));
        this.zoomMode='custom';
        document.getElementById('zoomSelect').value='';
        this.updateZoomDisplay();
        if(this.viewMode==='continuous')this.renderContinuous();
        else if(this.viewMode==='double')this.renderDouble();
        else this.renderPage();
    },

    updateZoomDisplay(){
        const pct=Math.round(this.scale*100);
        document.getElementById('zoomValue').textContent=pct+'%';
        document.getElementById('statusZoom').textContent=pct+'%';
    },

    updateStatus(){
        const pct=Math.round((this.currentPage/this.totalPages)*100);
        document.getElementById('statusProgress').textContent=`${this.currentPage} / ${this.totalPages} страниц`;
        document.getElementById('statusPercent').textContent=pct+'%';
        document.getElementById('progressFill').style.width=pct+'%';
    },

    setViewMode(mode){
        this.viewMode=mode;
        document.querySelectorAll('.view-btn').forEach(b=>b.classList.remove('active'));
        document.getElementById('btnView'+mode.charAt(0).toUpperCase()+mode.slice(1)).classList.add('active');
        if(mode==='continuous')this.renderContinuous();
        else if(mode==='double')this.renderDouble();
        else this.renderPage();
    },

    toggleSidebar(){
        this.sidebarOpen=!this.sidebarOpen;
        document.getElementById('sidebar').style.display=this.sidebarOpen?'flex':'none';
        document.getElementById('btnSidebar').classList.toggle('active',this.sidebarOpen);
    },

    switchTab(tab){
        this.sidebarTab=tab;
        document.querySelectorAll('.sidebar-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
        document.querySelectorAll('.sidebar-panel').forEach(p=>p.classList.remove('active'));
        document.getElementById('panel'+tab.charAt(0).toUpperCase()+tab.slice(1)).classList.add('active');
    },

    toggleSearch(){
        const bar=document.getElementById('searchBar');
        const show=bar.style.display==='none';
        bar.style.display=show?'flex':'none';
        if(show){document.getElementById('searchInput').focus();document.getElementById('btnSearch').classList.add('active')}
        else{document.getElementById('btnSearch').classList.remove('active');this.clearSearch()}
    },

    async search(query){
        this.searchQuery=query;
        this.searchResults=[];
        this.searchIndex=-1;
        if(!query||!this.pdfDoc){document.getElementById('searchCount').textContent='0 из 0';return}
        for(let i=1;i<=this.totalPages;i++){
            const page=await this.pdfDoc.getPage(i);
            const tc=await page.getTextContent();
            const text=tc.items.map(t=>t.str).join(' ');
            if(text.toLowerCase().includes(query.toLowerCase())){
                this.searchResults.push({page:i,text});
            }
        }
        document.getElementById('searchCount').textContent=`0 из ${this.searchResults.length}`;
        if(this.searchResults.length>0)this.searchNext();
    },

    searchNext(){
        if(this.searchResults.length===0)return;
        this.searchIndex=(this.searchIndex+1)%this.searchResults.length;
        const r=this.searchResults[this.searchIndex];
        this.goToPage(r.page);
        document.getElementById('searchCount').textContent=`${this.searchIndex+1} из ${this.searchResults.length}`;
    },

    searchPrev(){
        if(this.searchResults.length===0)return;
        this.searchIndex=(this.searchIndex-1+this.searchResults.length)%this.searchResults.length;
        const r=this.searchResults[this.searchIndex];
        this.goToPage(r.page);
        document.getElementById('searchCount').textContent=`${this.searchIndex+1} из ${this.searchResults.length}`;
    },

    clearSearch(){
        this.searchQuery='';this.searchResults=[];this.searchIndex=-1;
        document.getElementById('searchInput').value='';
        document.getElementById('searchCount').textContent='0 из 0';
    },

    toggleEditMode(){
        this.editMode=!this.editMode;
        document.getElementById('editToolbar').style.display=this.editMode?'flex':'none';
        document.getElementById('btnEditToggle').classList.toggle('active',this.editMode);
        const al=document.getElementById('annotationsLayer');
        al.classList.toggle('editing',this.editMode);
    },

    rotatePage(){
        this.rotation=(this.rotation+90)%360;
        if(this.viewMode==='continuous')this.renderContinuous();
        else if(this.viewMode==='double')this.renderDouble();
        else this.renderPage();
    },

    toggleFullscreen(){
        if(!document.fullscreenElement){
            document.documentElement.requestFullscreen();
            document.getElementById('btnFullscreen').classList.add('active');
        }else{
            document.exitFullscreen();
            document.getElementById('btnFullscreen').classList.remove('active');
        }
    },

    handleKeydown(e){
        if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
        if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();this.goToPage(this.currentPage-1)}
        else if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();this.goToPage(this.currentPage+1)}
        else if(e.key==='Home'){e.preventDefault();this.goToPage(1)}
        else if(e.key==='End'){e.preventDefault();this.goToPage(this.totalPages)}
        else if(e.ctrlKey&&e.key==='f'){e.preventDefault();if(!this.sidebarOpen)this.toggleSidebar();this.toggleSearch()}
        else if(e.ctrlKey&&e.key==='z'){e.preventDefault();this.undo()}
        else if(e.ctrlKey&&e.key==='y'){e.preventDefault();this.redo()}
        else if(e.ctrlKey&&e.key==='s'){e.preventDefault();this.saveData();this.showToast('Сохранено')}
    },

    async generateThumbnails(){
        const container=document.getElementById('thumbnailsContainer');
        container.innerHTML='';
        if(!this.pdfDoc)return;
        const batchSize=20;
        const renderBatch=(start)=>{
            const end=Math.min(start+batchSize,this.totalPages);
            for(let i=start;i<end;i++){
                const item=document.createElement('div');
                item.className='thumbnail-item';
                item.dataset.page=i+1;
                const thumb=document.createElement('div');
                thumb.className='thumbnail-canvas';
                const label=document.createElement('div');
                label.className='thumbnail-label';
                label.textContent=i+1;
                item.appendChild(thumb);item.appendChild(label);
                item.onclick=()=>this.goToPage(i+1);
                container.appendChild(item);
                this.pdfDoc.getPage(i+1).then(page=>{
                    const vp=page.getViewport({scale:0.2});
                    const c=document.createElement('canvas');
                    c.width=vp.width;c.height=vp.height;
                    thumb.appendChild(c);
                    page.render({canvasContext:c.getContext('2d'),viewport:vp});
                });
            }
            if(end<this.totalPages){
                const obs=new IntersectionObserver((entries)=>{
                    entries.forEach(en=>{if(en.isIntersecting){obs.disconnect();renderBatch(end)}});
                },{root:container});
                const sentinel=document.createElement('div');
                sentinel.style.height='1px';
                container.appendChild(sentinel);
                obs.observe(sentinel);
            }
        };
        renderBatch(0);
    },

    updateThumbnailActive(){
        document.querySelectorAll('.thumbnail-item').forEach(t=>{
            const active=parseInt(t.dataset.page)===this.currentPage;
            t.classList.toggle('active',active);
            const lbl=t.querySelector('.thumbnail-label');
            if(lbl)lbl.classList.toggle('active-label',active);
            if(active)t.scrollIntoView({block:'nearest',behavior:'smooth'});
        });
    },

    async loadOutline(){
        if(!this.pdfDoc)return;
        try{
            const outline=await this.pdfDoc.getOutline();
            const list=document.getElementById('outlineList');
            if(!outline||outline.length===0){
                list.innerHTML='<p class="empty-message">Оглавление отсутствует</p>';
                return;
            }
            list.innerHTML='';
            const renderItems=(items,level=0)=>{
                items.forEach(item=>{
                    const el=document.createElement('div');
                    el.className=`outline-item level-${Math.min(level+1,3)}`;
                    el.textContent=item.title;
                    el.onclick=async()=>{
                        if(item.dest){
                            let dest=item.dest;
                            if(typeof dest==='string'){
                                try{dest=await this.pdfDoc.getDestination(dest)}catch(e){return}
                            }
                            const idx=await this.pdfDoc.getPageIndex(dest[0]);
                            this.goToPage(idx+1);
                        }
                    };
                    list.appendChild(el);
                    if(item.items&&item.items.length>0)renderItems(item.items,level+1);
                });
            };
            renderItems(outline);
        }catch(e){
            document.getElementById('outlineList').innerHTML='<p class="empty-message">Оглавление отсутствует</p>';
        }
    },

    drawAnnotations(){
        const layer=document.getElementById('annotationsLayer');
        const canvas=document.getElementById('pdfCanvas');
        if(!canvas)return;
        layer.style.width=canvas.width+'px';
        layer.style.height=canvas.height+'px';
        layer.innerHTML='';
        this.annotations.filter(a=>a.page===this.currentPage).forEach(a=>{
            if(a.type==='highlight'||a.type==='underline'||a.type==='strikethrough'){
                const el=document.createElement('div');
                el.className='annotation '+a.type;
                if(a.id===this.selectedAnnotation)el.classList.add('selected');
                el.style.left=a.x+'px';el.style.top=a.y+'px';
                el.style.width=a.w+'px';el.style.height=a.h+'px';
                if(a.type==='highlight')el.style.background=a.color||'rgba(255,235,59,0.4)';
                if(a.type==='underline')el.style.borderBottomColor=a.color||'#4a9cc7';
                if(a.type==='strikethrough')el.style.textDecorationColor=a.color||'#f44';
                el.onclick=(e)=>{e.stopPropagation();this.selectedAnnotation=a.id;this.drawAnnotations()};
                layer.appendChild(el);
            }else if(a.type==='text'){
                const el=document.createElement('div');
                el.className='annotation-text';
                el.textContent=a.text;
                el.style.left=a.x+'px';el.style.top=a.y+'px';
                el.style.fontSize=(a.fontSize||14)+'px';
                el.style.color=a.color||'#000';
                if(a.id===this.selectedAnnotation)el.classList.add('selected');
                el.onclick=(e)=>{e.stopPropagation();this.selectedAnnotation=a.id;this.drawAnnotations()};
                layer.appendChild(el);
            }else if(a.type==='draw'||a.type==='line'||a.type==='rect'){
                const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
                svg.setAttribute('class','annotation-draw');
                svg.style.left='0';svg.style.top='0';
                svg.style.width='100%';svg.style.height='100%';
                if(a.type==='draw'&&a.points&&a.points.length>0){
                    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
                    let d='M'+a.points[0].x+' '+a.points[0].y;
                    for(let i=1;i<a.points.length;i++)d+=' L'+a.points[i].x+' '+a.points[i].y;
                    path.setAttribute('d',d);
                    path.setAttribute('stroke',a.color||'#f44');
                    path.setAttribute('stroke-width',a.size||2);
                    path.setAttribute('fill','none');
                    path.setAttribute('stroke-linecap','round');
                    path.setAttribute('stroke-linejoin','round');
                    svg.appendChild(path);
                }else if(a.type==='line'){
                    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
                    line.setAttribute('x1',a.x1);line.setAttribute('y1',a.y1);
                    line.setAttribute('x2',a.x2);line.setAttribute('y2',a.y2);
                    line.setAttribute('stroke',a.color||'#f44');
                    line.setAttribute('stroke-width',a.size||2);
                    svg.appendChild(line);
                }else if(a.type==='rect'){
                    const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
                    rect.setAttribute('x',a.x);rect.setAttribute('y',a.y);
                    rect.setAttribute('width',a.w);rect.setAttribute('height',a.h);
                    rect.setAttribute('stroke',a.color||'#f44');
                    rect.setAttribute('stroke-width',a.size||2);
                    rect.setAttribute('fill','none');
                    svg.appendChild(rect);
                }
                layer.appendChild(svg);
            }
        });
    },

    setupDrawEvents(){
        const layer=document.getElementById('annotationsLayer');
        let drawing=false;

        layer.addEventListener('mousedown',(e)=>{
            if(!this.editMode)return;
            const canvas=document.getElementById('pdfCanvas');
            const rect=canvas.getBoundingClientRect();
            const x=e.clientX-rect.left;
            const y=e.clientY-rect.top;
            const tool=this.editTool;
            const color=document.getElementById('editColor').value;
            const size=parseInt(document.getElementById('editSize').value);

            if(tool==='text'){
                this.pendingTextPos={x,y};
                document.getElementById('textModal').style.display='flex';
                document.getElementById('addTextInput').value='';
                document.getElementById('addTextInput').focus();
                return;
            }

            drawing=true;
            if(tool==='draw'){
                this.currentDrawAnnotation={type:'draw',page:this.currentPage,points:[{x,y}],color,size,id:Date.now().toString()};
            }else if(tool==='line'){
                this.currentDrawAnnotation={type:'line',page:this.currentPage,x1:x,y1:y,x2:x,y2:y,color,size,id:Date.now().toString()};
            }else if(tool==='rect'){
                this.currentDrawAnnotation={type:'rect',page:this.currentPage,x,y,w:0,h:0,color,size,id:Date.now().toString()};
            }
        });

        layer.addEventListener('mousemove',(e)=>{
            if(!drawing||!this.currentDrawAnnotation)return;
            const canvas=document.getElementById('pdfCanvas');
            const rect=canvas.getBoundingClientRect();
            const x=e.clientX-rect.left;
            const y=e.clientY-rect.top;
            const a=this.currentDrawAnnotation;
            if(a.type==='draw'){a.points.push({x,y})}
            else if(a.type==='line'){a.x2=x;a.y2=y}
            else if(a.type==='rect'){a.w=x-a.x;a.h=y-a.y}
            this.drawAnnotations();
        });

        const endDraw=()=>{
            if(!drawing||!this.currentDrawAnnotation)return;
            drawing=false;
            this.pushAnnotation(this.currentDrawAnnotation);
            this.currentDrawAnnotation=null;
        };
        layer.addEventListener('mouseup',endDraw);
        layer.addEventListener('mouseleave',endDraw);
    },

    pushAnnotation(a){
        this.annotations.push(a);
        this.selectedAnnotation=a.id;
        this.drawAnnotations();
        this.saveData();
    },

    deleteSelectedAnnotation(){
        if(!this.selectedAnnotation)return;
        this.annotations=this.annotations.filter(a=>a.id!==this.selectedAnnotation);
        this.selectedAnnotation=null;
        this.drawAnnotations();
        this.saveData();
        this.showToast('Удалено');
    },

    undo(){
        if(this.annotations.length===0)return;
        this.annotations.pop();
        this.drawAnnotations();
        this.saveData();
    },

    redo(){},

    showBookmarkModal(){
        document.getElementById('bookmarkModal').style.display='flex';
        document.getElementById('bookmarkPageNum').textContent=this.currentPage;
        document.getElementById('bookmarkName').value='';
        document.getElementById('bookmarkName').focus();
    },

    saveBookmark(){
        const name=document.getElementById('bookmarkName').value.trim()||'Страница '+this.currentPage;
        this.bookmarks.push({name,page:this.currentPage,id:Date.now().toString()});
        document.getElementById('bookmarkModal').style.display='none';
        this.renderBookmarks();
        this.saveData();
        this.showToast('Закладка добавлена');
    },

    renderBookmarks(){
        const list=document.getElementById('bookmarksList');
        if(this.bookmarks.length===0){list.innerHTML='<p class="empty-message">Нет закладок</p>';return}
        list.innerHTML='';
        this.bookmarks.forEach(b=>{
            const el=document.createElement('div');
            el.className='bookmark-item';
            el.innerHTML=`<div class="bookmark-item-title">${this.esc(b.name)}</div>
                <div class="bookmark-item-page">Страница ${b.page}</div>
                <div class="bookmark-actions">
                    <button class="bookmark-action-btn" data-action="delete" title="Удалить">&#10005;</button>
                </div>`;
            el.querySelector('.bookmark-item-title').onclick=()=>this.goToPage(b.page);
            el.querySelector('[data-action="delete"]').onclick=(e)=>{e.stopPropagation();this.bookmarks=this.bookmarks.filter(x=>x.id!==b.id);this.renderBookmarks();this.saveData()};
            list.appendChild(el);
        });
    },

    showNoteModal(){
        document.getElementById('noteModal').style.display='flex';
        document.getElementById('notePageNum').textContent=this.currentPage;
        document.getElementById('noteTitle').value='';
        document.getElementById('noteText').value='';
        document.getElementById('noteTitle').focus();
    },

    saveNote(){
        const title=document.getElementById('noteTitle').value.trim()||'Заметка';
        const text=document.getElementById('noteText').value.trim();
        this.notes.push({title,text,page:this.currentPage,id:Date.now().toString(),date:new Date().toLocaleDateString('ru')});
        document.getElementById('noteModal').style.display='none';
        this.renderNotes();
        this.saveData();
        this.showToast('Заметка сохранена');
    },

    renderNotes(){
        const list=document.getElementById('notesList');
        if(this.notes.length===0){list.innerHTML='<p class="empty-message">Нет заметок</p>';return}
        list.innerHTML='';
        this.notes.forEach(n=>{
            const el=document.createElement('div');
            el.className='note-item';
            el.innerHTML=`<div class="note-item-title">${this.esc(n.title)}</div>
                <div class="note-item-page">Страница ${n.page} &middot; ${n.date}</div>
                ${n.text?`<div class="note-item-text">${this.esc(n.text)}</div>`:''}
                <div class="note-actions">
                    <button class="note-action-btn" data-action="delete" title="Удалить">&#10005;</button>
                </div>`;
            el.onclick=()=>this.goToPage(n.page);
            el.querySelector('[data-action="delete"]').onclick=(e)=>{e.stopPropagation();this.notes=this.notes.filter(x=>x.id!==n.id);this.renderNotes();this.saveData()};
            list.appendChild(el);
        });
    },

    saveTextAnnotation(){
        const text=document.getElementById('addTextInput').value.trim();
        if(!text||!this.pendingTextPos)return;
        this.pushAnnotation({
            type:'text',page:this.currentPage,
            x:this.pendingTextPos.x,y:this.pendingTextPos.y,
            text,fontSize:parseInt(document.getElementById('textFontSize').value),
            color:document.getElementById('textColor').value,
            id:Date.now().toString()
        });
        document.getElementById('textModal').style.display='none';
        this.pendingTextPos=null;
    },

    saveData(){
        if(!this.fileId)return;
        const data={
            currentPage:this.currentPage,
            scale:this.scale,
            zoomMode:this.zoomMode,
            viewMode:this.viewMode,
            rotation:this.rotation,
            annotations:this.annotations,
            bookmarks:this.bookmarks,
            notes:this.notes,
            lastOpen:Date.now()
        };
        try{localStorage.setItem('docs_'+this.fileId,JSON.stringify(data))}catch(e){}
    },

    loadData(){
        try{
            const raw=localStorage.getItem('docs_'+this.fileId);
            if(!raw)return;
            const d=JSON.parse(raw);
            if(d.currentPage)this.currentPage=d.currentPage;
            if(d.annotations)this.annotations=d.annotations;
            if(d.bookmarks)this.bookmarks=d.bookmarks;
            if(d.notes)this.notes=d.notes;
            if(d.scale)this.scale=d.scale;
            if(d.viewMode)this.viewMode=d.viewMode;
            if(d.rotation)this.rotation=d.rotation;
            this.renderBookmarks();
            this.renderNotes();
        }catch(e){}
    },

    getSavedData(){
        try{
            const raw=localStorage.getItem('docs_'+this.fileId);
            return raw?JSON.parse(raw):null;
        }catch(e){return null}
    },

    updateRecentDocs(){
        let docs=[];
        try{docs=JSON.parse(localStorage.getItem('recentDocs')||'[]')}catch(e){}
        docs=docs.filter(d=>d.id!==this.fileId);
        docs.unshift({id:this.fileId,name:this.fileName,totalPages:this.totalPages,lastPage:this.currentPage,lastOpen:Date.now()});
        if(docs.length>20)docs=docs.slice(0,20);
        try{localStorage.setItem('recentDocs',JSON.stringify(docs))}catch(e){}
    },

    loadRecentDocs(){
        let docs=[];
        try{docs=JSON.parse(localStorage.getItem('recentDocs')||'[]')}catch(e){}
        const grid=document.getElementById('recentGrid');
        const section=document.getElementById('recentSection');
        if(docs.length===0){section.style.display='none';return}
        section.style.display='block';
        grid.innerHTML='';
        docs.forEach(d=>{
            const pct=d.totalPages?Math.round((d.lastPage/d.totalPages)*100):0;
            const card=document.createElement('div');
            card.className='recent-card';
            card.innerHTML=`<div class="recent-thumb"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div>
                <div class="recent-info">
                    <div class="recent-name">${this.esc(d.name)}</div>
                    <div class="recent-meta">Страница ${d.lastPage||1} из ${d.totalPages||'?'}</div>
                    <div class="recent-progress">${pct}% прочитано</div>
                    <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
                </div>
                <button class="recent-delete" title="Удалить из списка">&#10005;</button>`;
            card.onclick=(e)=>{if(!e.target.closest('.recent-delete'))this.openRecentDoc(d.id,d.name)};
            card.querySelector('.recent-delete').onclick=(e)=>{e.stopPropagation();this.deleteRecentDoc(d.id,d.name)};
            grid.appendChild(card);
        });
    },

    deleteRecentDoc(id,name){
        let docs=[];
        try{docs=JSON.parse(localStorage.getItem('recentDocs')||'[]')}catch(e){}
        docs=docs.filter(d=>d.id!==id);
        try{localStorage.setItem('recentDocs',JSON.stringify(docs))}catch(e){}
        try{localStorage.removeItem('docs_'+id)}catch(e){}
        this.deleteFileFromDB(id);
        this.loadRecentDocs();
        this.showToast('Удалено: '+name);
    },

    goHome(){
        this.saveData();
        this.updateRecentDocs();
        document.getElementById('readerScreen').style.display='none';
        document.getElementById('homeScreen').style.display='flex';
        this.loadRecentDocs();
        if(this.pdfDoc){this.pdfDoc.destroy();this.pdfDoc=null}
    },

    printPDF(){
        if(!this.pdfDoc)return;
        const printAll=async()=>{
            const pages=[];
            for(let i=1;i<=this.totalPages;i++){
                const page=await this.pdfDoc.getPage(i);
                const vp=page.getViewport({scale:1.5});
                const c=document.createElement('canvas');
                c.width=vp.width;c.height=vp.height;
                await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
                pages.push(c.toDataURL('image/png'));
            }
            const win=window.open('','_blank');
            win.document.write('<html><head><title>Печать - '+this.fileName+'</title></head><body style="margin:0"></body></html>');
            pages.forEach(p=>{win.document.write('<img src="'+p+'" style="width:100%;page-break-after:always">')});
            win.document.close();
            setTimeout(()=>win.print(),500);
        };
        printAll();
    },

    downloadPDF(){
        if(!this.fileData)return;
        const blob=new Blob([new Uint8Array(this.fileData)],{type:'application/pdf'});
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=this.fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    },

    saveCopy(){
        this.downloadPDF();
        this.showToast('Копия сохранена');
    },

    showToast(msg){
        const t=document.getElementById('toast');
        document.getElementById('toastMessage').textContent=msg;
        t.style.display='block';
        t.classList.add('show');
        setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.style.display='none',300)},2000);
    }
};

document.addEventListener('DOMContentLoaded',()=>App.init());
