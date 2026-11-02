#!/usr/bin/env python3
"""Download selected metadata/files at a pinned Hugging Face commit; never a full mirror by default."""
import argparse
from huggingface_hub import HfApi, snapshot_download
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('repo', help='For example ieasybooks-org/waqfeya-library')
p.add_argument('--revision', default='main')
p.add_argument('--pattern', action='append', help='Exact file/folder glob; repeat to select more. Default: index.tsv and README.md only.')
p.add_argument('--output', default='imports/datasets')
a=p.parse_args()
info=HfApi().dataset_info(a.repo, revision=a.revision)
patterns=a.pattern or ['index.tsv','README.md']
print('Pinned revision:',info.sha)
print('Selected paths:',patterns)
snapshot_download(repo_id=a.repo,repo_type='dataset',revision=info.sha,allow_patterns=patterns,local_dir=a.output+'/'+a.repo.split('/')[-1])
print('Files downloaded for review. No hosting rights were inferred or granted.')
